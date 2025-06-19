import { spawn } from 'child_process';
import * as os from 'os';
export var ShellType;
(function (ShellType) {
    ShellType["CMD"] = "cmd";
    ShellType["POWERSHELL"] = "powershell";
    ShellType["BASH"] = "bash";
    ShellType["ZSH"] = "zsh";
    ShellType["SH"] = "sh";
})(ShellType || (ShellType = {}));
export class SessionShell {
    constructor(shellType, startWorkingDir, timeoutMs) {
        this.process = null;
        this.timeoutHandle = null;
        this.sessionStartTime = 0;
        this.shellType = shellType;
        this.startWorkingDir = startWorkingDir;
        this.timeout = timeoutMs;
    }
    /**
     * Genera un marker dinamico unico per identificare la fine di un comando
     */
    generateMarker() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
        const random = Math.floor(Math.random() * 1000000);
        return `SHELL_MARKER_${random}_${timestamp}`;
    }
    /**
     * Restituisce comando e argomenti per avviare la shell specifica
     */
    getShellSpawnInfo() {
        switch (this.shellType) {
            case ShellType.CMD:
                return { command: 'cmd.exe', args: ['/Q', '/K', 'prompt $P$G'] }; // /Q disabilita echo, /K mantiene aperta
            case ShellType.POWERSHELL:
                return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-InputFormat', 'Text'] };
            case ShellType.BASH:
                return { command: 'bash', args: ['--norc', '--noprofile', '-i'] };
            case ShellType.ZSH:
                return { command: 'zsh', args: ['-f', '-i'] }; // -f no rcs, -i interactive
            case ShellType.SH:
                return { command: 'sh', args: ['-i'] };
            default:
                throw new Error(`Unsupported shell type: ${this.shellType}`);
        }
    }
    /**
     * Formatta il comando con il marker di fine per ogni tipo di shell
     */
    formatCommandWithMarker(command, marker) {
        switch (this.shellType) {
            case ShellType.CMD:
                // Per CMD usiamo && che funziona correttamente
                return `(${command}) && echo ${marker}_EXITCODE_%ERRORLEVEL%`;
            case ShellType.POWERSHELL:
                // Per PowerShell, gestiamo sia versioni vecchie che nuove
                // Usiamo try-catch per gestire errori e $LASTEXITCODE per l'exit code
                return `try { ${command}; echo "${marker}_EXITCODE_$LASTEXITCODE" } catch { echo "${marker}_EXITCODE_1_ERROR_$($_.Exception.Message)" }`;
            case ShellType.BASH:
            case ShellType.ZSH:
            case ShellType.SH:
                // Per shell Unix usiamo $? per catturare l'exit code
                return `${command}; echo "${marker}_EXITCODE_$?"`;
            default:
                return `(${command}) && echo ${marker}`;
        }
    }
    /**
     * Restituisce il comando appropriato per ottenere la directory corrente
     */
    getPwdCommand() {
        switch (this.shellType) {
            case ShellType.CMD:
                return 'cd';
            case ShellType.POWERSHELL:
                return 'Get-Location | Select-Object -ExpandProperty Path';
            case ShellType.BASH:
            case ShellType.ZSH:
            case ShellType.SH:
                return 'pwd';
            default:
                return 'pwd';
        }
    }
    /**
     * Inizializza il processo shell
     */
    async initializeProcess() {
        this.sessionStartTime = Date.now();
        return new Promise((resolve, reject) => {
            const { command, args } = this.getShellSpawnInfo();
            this.process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
                env: {
                    ...process.env,
                    TERM: 'dumb', // Evita controlli ANSI
                    PS1: '$ ', // Prompt semplice per bash/zsh
                },
                cwd: this.startWorkingDir
            });
            if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
                reject(new Error('Failed to create process streams'));
                return;
            }
            // Setup timeout globale per l'intera sessione
            this.timeoutHandle = setTimeout(() => {
                console.error(`Session timeout after ${this.timeout}ms -> killing process`);
                this.killProcess();
                reject(new Error(`Session timeout after ${this.timeout}ms`));
            }, this.timeout);
            this.process.on('error', (error) => {
                this.clearTimeout();
                reject(new Error(`Failed to start shell: ${error.message}`));
            });
            this.process.on('exit', (code, signal) => {
                this.clearTimeout();
                if (signal && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
                    reject(new Error(`Process exited unexpectedly with signal: ${signal}`));
                }
            });
            // Diamo tempo alla shell di inizializzarsi
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    resolve();
                }
                else {
                    reject(new Error('Process died during initialization'));
                }
            }, 200);
        });
    }
    /**
     * Esegue un singolo comando e attende il completamento tramite marker
     */
    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin || !this.process.stdout || !this.process.stderr) {
                reject(new Error('Process not initialized'));
                return;
            }
            const marker = this.generateMarker();
            const formattedCommand = this.formatCommandWithMarker(command, marker);
            const elapsedTime = Date.now() - this.sessionStartTime;
            const remainingTime = Math.max(1000, (this.timeout - elapsedTime) * 0.95);
            // console.error(`Timeout debug: Session started at ${new Date(this.sessionStartTime).toISOString()}`);
            // console.error(`Timeout debug: Current time is ${new Date().toISOString()}`);
            // console.error(`Timeout debug: Elapsed time is ${elapsedTime}ms`);
            // console.error(`Timeout debug: Remaining time for command is ${remainingTime}ms`);
            console.error(`Executing command "${command.substring(0, 20)}" - timeout ${(remainingTime / 1000).toFixed(2)}s - marker "${marker}" - Full Formatted: "${formattedCommand}"`);
            let output = '';
            let errorOutput = '';
            let commandFinished = false;
            let commandTimeout;
            const cleanup = () => {
                if (commandTimeout)
                    clearTimeout(commandTimeout);
                this.process.stdout.removeListener('data', dataHandler);
                this.process.stderr.removeListener('data', errorHandler);
            };
            const dataHandler = (data) => {
                if (commandFinished)
                    return;
                const chunk = data.toString();
                // console.error(`Received data chunk: ----\n${chunk.substring(0, 500)}\n--------`);
                output += chunk;
                // Cerca il marker con pattern più robusto
                // Supporta: MARKER_EXITCODE_0, MARKER_EXITCODE_1_ERROR_message
                const markerRegex = new RegExp(`${marker}_EXITCODE_([0-9]+)(?:_ERROR_(.*))?`, 'm');
                const match = output.match(markerRegex);
                if (match) {
                    commandFinished = true;
                    cleanup();
                    // Rimuovi tutto dalla posizione del marker in poi
                    const markerIndex = output.indexOf(match[0]);
                    const cleanOutput = output.substring(0, markerIndex).trim();
                    const exitCode = parseInt(match[1], 10);
                    const errorMessage = match[2] ? match[2].trim() : undefined;
                    const result = {
                        command,
                        output: cleanOutput,
                        exitCode
                    };
                    // Determina se c'è stato un errore
                    if (exitCode !== 0 || errorMessage) {
                        result.error = errorMessage || errorOutput.trim() || `Command exited with code ${exitCode}`;
                    }
                    resolve(result);
                }
            };
            const errorHandler = (data) => {
                if (commandFinished)
                    return;
                errorOutput += data.toString();
            };
            commandTimeout = setTimeout(() => {
                console.error(`Command timeout after ${remainingTime}ms: ${command}`);
                if (!commandFinished) {
                    commandFinished = true;
                    cleanup();
                    reject(new Error(`Command timeout after ${remainingTime}ms: ${command}`));
                }
            }, remainingTime);
            this.process.stdout.on('data', dataHandler);
            this.process.stderr.on('data', errorHandler);
            // Invia il comando
            try {
                this.process.stdin.write(formattedCommand + '\n');
            }
            catch (error) {
                cleanup();
                reject(new Error(`Failed to send command: ${error}`));
            }
        });
    }
    /**
     * Cancella il timeout globale
     */
    clearTimeout() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
    }
    /**
     * Termina il processo shell
     */
    killProcess() {
        if (this.process && !this.process.killed) {
            // Prima prova SIGTERM
            this.process.kill('SIGTERM');
            // Se dopo 3 secondi non è morto, usa SIGKILL
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
            }, 3000);
        }
    }
    /**
     * Esegue una sequenza di comandi in ordine, fermandosi al primo errore
     */
    async executeSequence(commands) {
        if (!commands || commands.length === 0)
            throw new Error('No commands provided for execution');
        const results = [];
        let finalWorkingDirectory = '';
        try {
            await this.initializeProcess();
            // Esegui ogni comando in sequenza
            for (const command of commands) {
                if (!command.trim())
                    throw new Error('Empty command found in sequence');
                const result = await this.executeCommand(command.trim());
                console.error(`Command executed: ${command} - Exit code: ${result.exitCode}`);
                results.push(result);
                // Fermati al primo errore (exit code != 0 o presenza di errore)
                if (result.exitCode !== 0 || result.error) {
                    throw new Error(`Command failed: "${command}"\n` +
                        `Exit code: ${result.exitCode}\n` +
                        `Error: ${result.error || 'Unknown error'}`);
                }
            }
            // Ottieni la directory corrente finale
            const pwdCommand = this.getPwdCommand();
            const pwdResult = await this.executeCommand(pwdCommand);
            if (pwdResult.exitCode === 0) {
                finalWorkingDirectory = this.cleanPwdOutput(pwdResult.output);
            }
            else {
                // Se pwd fallisce, usa directory vuota ma non fallire l'intera operazione
                finalWorkingDirectory = '';
            }
            return {
                commands: results,
                finalWorkingDirectory,
                success: true
            };
        }
        catch (error) {
            return {
                commands: results,
                finalWorkingDirectory,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
        finally {
            this.cleanup();
        }
    }
    /**
     * Pulisce risorse
     */
    cleanup() {
        this.clearTimeout();
        if (this.process) {
            this.killProcess();
            this.process = null;
        }
    }
    /**
     * Verifica se il tipo di shell è supportato sul sistema operativo corrente
     */
    static isShellSupported(shellType) {
        const platform = os.platform();
        switch (shellType) {
            case ShellType.CMD:
            case ShellType.POWERSHELL:
                return platform === 'win32';
            case ShellType.BASH:
            case ShellType.ZSH:
            case ShellType.SH:
                return platform !== 'win32';
            default:
                return false;
        }
    }
    /**
     * Pulisce l'output del comando pwd rimuovendo prompt e caratteri extra
     */
    cleanPwdOutput(rawOutput) {
        const output = rawOutput.trim();
        switch (this.shellType) {
            case ShellType.CMD:
                // CMD output format: "C:\some\path>C:\some\path" o solo "C:\some\path>"
                // Rimuovi tutto fino all'ultimo '>' e prendi quello che segue
                const cmdMatch = output.match(/.*>(.*)$/);
                if (cmdMatch && cmdMatch[1]) {
                    return cmdMatch[1].trim();
                }
                // Fallback: se non c'è match, cerca pattern drive:\path
                const driveMatch = output.match(/[A-Za-z]:\\[^>]*$/);
                return driveMatch ? driveMatch[0] : output;
            case ShellType.POWERSHELL:
                // PowerShell dovrebbe già ritornare solo il path grazie a Select-Object -ExpandProperty Path
                // Ma rimuovi eventuali prompt PS C:\> se presenti
                const psMatch = output.match(/PS\s+[^>]*>\s*(.*)$/) || output.match(/(.*)$/);
                return psMatch ? psMatch[psMatch.length - 1].trim() : output;
            case ShellType.BASH:
            case ShellType.ZSH:
            case ShellType.SH:
                // Unix shells: rimuovi eventuali prompt come "user@host:/path$ /path"
                // Cerca l'ultimo path assoluto (che inizia con /)
                const unixMatch = output.match(/.*\s(\/[^\s]*)$/) || output.match(/(\/[^\s]*)/) || output.match(/.*\s([^\s]+)$/);
                if (unixMatch && unixMatch[1] && unixMatch[1].startsWith('/')) {
                    return unixMatch[1];
                }
                // Fallback: prendi l'ultima "parola" se sembra un path
                const words = output.split(/\s+/);
                const lastWord = words[words.length - 1];
                return lastWord.includes('/') ? lastWord : output;
            default:
                return output;
        }
    }
}
