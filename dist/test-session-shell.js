#!/usr/bin/env node
import { SessionShell, ShellType } from "./utils/session-shell.js";
(async function () {
    const shell = new SessionShell(ShellType.CMD, 'C:\\tmp', 100000);
    const res = await shell.executeSequence([
        'echo Hello World',
        'echo This is a test',
        'echo %cd%',
        'cd /',
        'echo Listing root directory',
        'dir',
        'cd C:\\local\\work\\clienti\\lamemind\\ai\\mcp-server-codeact\\.clinerules',
        'echo Changed directory to .clinerules',
        'dir',
        'echo Done'
    ]);
    console.log('Execution result:', res);
})();
