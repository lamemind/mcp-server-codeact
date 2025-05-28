# Code Act MCP Server - MVP

## Il Problema

I tool MCP esistenti costringono l'LLM in un loop inefficiente:

```
LLM: "Crea progetto Node.js"
→ write_file("package.json", "...")
→ create_directory("src") 
→ write_file("src/index.js", "...")
→ create_directory("tests")
→ execute_command("npm install")
```

Ogni operazione blocca l'LLM, introduce latenza, e frammenta quello che dovrebbe essere un task atomico. L'LLM può ragionare su workflow complessi ma i tool lo costringono a micro-management.

## La Soluzione

Due tool. Basta.

**Paradigma**: L'LLM sottomette batch di operazioni e può continuare a ragionare mentre il sistema le esegue in parallelo.

## Tool Documentation

### 1. batch_execute

Esegue batch di operazioni in parallelo o sequenza.

```typescript
{
  name: "batch_execute",
  schema: {
    operations: Array<{
      type: 'file_write',
      files: Array<{ path: string, content: string }>
    } | {
      type: 'dir_create', 
      paths: string[]
    } | {
      type: 'shell_exec',
      commands: string[]
    } | {
      type: 'code_exec',
      runtime: 'node' | 'php' | 'python',
      code: string
    }>,
    sync?: boolean,        // Default: false (async)
    workdir?: string       // Working directory
  },
  returns: {
    // Se sync=true
    results?: Array<{
      operation_index: number,
      status: 'success' | 'error',
      output?: string,
      error?: string
    }>,
    
    // Se sync=false  
    batch_id?: string,
    status?: 'queued' | 'running'
  }
}
```

### 2. await

Controlla stato o attende completamento batch asincrono.

```typescript
{
  name: "await",
  schema: { 
    batch_id: string,
    timeout?: number  // ms, undefined = wait infinito
  },
  returns: {
    status: 'completed' | 'failed' | 'running' | 'timeout',
    results?: Array<{
      operation_index: number,
      status: 'success' | 'error',
      output?: string,
      error?: string
    }>,
    operations_completed: number,
    operations_total: number
  }
}
```

## Pattern d'Uso

### Pattern 1: Fire-and-Continue
```typescript
// Avvia setup lungo
const setupId = batch_execute({
  operations: [
    { type: 'dir_create', paths: ['src/', 'tests/'] },
    { type: 'file_write', files: [...moltiFiles] }
  ],
  sync: false
});

// Continua a ragionare mentre setup corre
// ... analizza requirements, genera codice, etc ...

// Check se setup è finito
const result = await(setupId, timeout: 0);
if (result.status === 'completed') {
  // Procedi con fase 2
}
```

### Pattern 2: Dependency Chain
```typescript
// Fase 1: Struttura base
const structureId = batch_execute({
  operations: [
    { type: 'dir_create', paths: ['src/'] },
    { type: 'file_write', files: [packageJson] }
  ],
  sync: false
});

// Prepara source mentre struttura si crea
const sourceCode = generateFiles();

// Attendi struttura (timeout ragionevole)
await(structureId, timeout: 3000);

// Fase 2: Installa deps + scrivi source in parallelo
const installId = batch_execute({
  operations: [{ type: 'shell_exec', commands: ['npm install'] }],
  sync: false
});

const sourceId = batch_execute({
  operations: [{ type: 'file_write', files: sourceCode }],
  sync: false
});

// Attendi entrambi prima del test
await(installId);
await(sourceId);
```

## Esempi Concreti

### Esempio 1: Express API Completa

```typescript
batch_execute({
  operations: [
    // Struttura
    { type: 'dir_create', paths: ['src/', 'src/routes/', 'tests/'] },
    
    // File di configurazione
    { type: 'file_write', files: [
      { path: 'package.json', content: packageJson },
      { path: '.env', content: 'PORT=3000' },
      { path: 'src/app.js', content: expressApp }
    ]},
    
    // Routes
    { type: 'file_write', files: [
      { path: 'src/routes/users.js', content: usersRoute }
    ]},
    
    // Setup
    { type: 'shell_exec', commands: ['npm install express'] },
    { type: 'code_exec', runtime: 'node', code: 'console.log("Setup completo")' }
  ],
  sync: true
})
```

### Esempio 2: Workflow Asincrono

```typescript
// Avvia build lungo
const buildId = batch_execute({
  operations: [
    { type: 'shell_exec', commands: ['npm run build:prod', 'npm run test'] }
  ],
  sync: false
});

// Nel frattempo prepara deployment
const deployFiles = prepareDeployment();

// Check periodico build
let buildResult = await(buildId, timeout: 5000);
if (buildResult.status === 'running') {
  // Build ancora in corso, continua altro lavoro
  prepareDocs();
  
  // Attesa finale
  buildResult = await(buildId);
}

if (buildResult.status === 'completed') {
  // Deploy
  batch_execute({
    operations: [
      { type: 'file_write', files: deployFiles },
      { type: 'shell_exec', commands: ['docker build .'] }
    ],
    sync: true
  });
}
```

## Sicurezza

### Opzioni Disponibili

**Level 1: Process Isolation (Default)**
- Job Objects su Windows, cgroups su Linux
- Limiti memoria/CPU
- Filesystem sandbox
- Zero overhead, sicurezza base

**Level 2: Container Isolation**
- Docker/Podman per operazioni shell/code
- Isolamento completo
- Overhead moderato

**Level 3: VM Isolation** 
- Windows Sandbox, KVM
- Sicurezza massima
- Overhead significativo

### Configurazione

```typescript
// Nel server config
{
  security: {
    level: 'process' | 'container' | 'vm',
    limits: {
      memory_mb: 512,
      cpu_percent: 50,
      timeout_ms: 30000
    },
    filesystem: {
      allowed_paths: ['/tmp', './workspace'],
      readonly_paths: ['/usr', '/etc']
    }
  }
}
```

## Implementazione MVP

**In memoria, stateful**:
- Map di batch attivi in RAM
- Dependency analysis semplice
- Execution seriale con parallelismo opzionale
- Cleanup automatico alla disconnessione

**Target**: Dimostrare il valore del paradigma batch-async eliminando complexity non essenziale.

## Valore Core

1. **Riduzione drastica tool calls** - da 10-15 call a 1-2 per workflow complessi
2. **Parallelizzazione naturale** - operazioni indipendenti corrono insieme
3. **LLM liberation** - può ragionare mentre sistema lavora
4. **Semantica cognitiva** - granularità che rispetta il pensiero sviluppatore

La rivoluzione non è tecnica. È concettuale.