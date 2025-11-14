const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');

let backendProcess = null;
let nextProcess = null;
let BACKEND_PORT = 8002;
let FRONTEND_PORT = 3005;

function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      console.log(`Port ${startPort} is busy, trying ${startPort + 1}`);
      resolve(findFreePort(startPort + 1));
    });
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const isDev = process.env.NODE_ENV === 'development';
    let backendPath;
    
    if (isDev) {
      backendPath = path.join(__dirname, '..', '..', 'run_api.py');
      backendProcess = spawn('python', [backendPath], {
        cwd: path.join(__dirname, '..', '..'),
      });
    } else {
      backendPath = path.join(process.resourcesPath, 'backend', 'api', 'api.exe');
      console.log(`Starting backend from: ${backendPath}`);
      backendProcess = spawn(backendPath, [], {
        env: { ...process.env, PORT: BACKEND_PORT.toString() },
        cwd: path.dirname(backendPath)
      });
    }
    
    console.log('Starting backend server...');
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
      if (data.includes('Uvicorn running') || data.includes('Application startup complete')) {
        resolve();
      }
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });
    
    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });
    
    backendProcess.on('error', (err) => {
      console.error(`Backend spawn error: ${err}`);
      reject(err);
    });
    
    setTimeout(() => resolve(), 5000);
  });
}

async function startNextServer() {
  return new Promise(async (resolve, reject) => {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      resolve();
      return;
    }
    
    FRONTEND_PORT = await findFreePort(FRONTEND_PORT);
    console.log(`Using frontend port: ${FRONTEND_PORT}`);
    
    const appPath = app.getAppPath();
    const possiblePaths = [
      path.join(appPath, '..', 'server.js'),
      path.join(appPath, 'server.js'),
      path.join(appPath, '..', '..', 'server.js'),
      path.join(__dirname, '..', 'server.js'),
      path.join(process.resourcesPath, 'server.js')
    ];
    
    let nextServerPath = null;
    for (const p of possiblePaths) {
      console.log(`Checking path: ${p}`);
      if (fs.existsSync(p)) {
        nextServerPath = p;
        console.log(`Found Next.js server at: ${nextServerPath}`);
        break;
      }
    }
    
    if (!nextServerPath) {
      console.error('Next.js server not found. Tried:', possiblePaths);
      reject(new Error('Next.js server not found'));
      return;
    }
    
    console.log('Starting Next.js server...');
    const serverDir = path.dirname(nextServerPath);

    // Resolve node binary: prefer bundled node in resources, fallback to system 'node'
    function resolveNodeBinary() {
      const appRoot = path.dirname(app.getPath('exe'));
      const bundledNode = path.join(appRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
      console.log('Checking bundled node at:', bundledNode);
      if (fs.existsSync(bundledNode)) {
        try {
          const check = spawnSync(bundledNode, ['-v'], { encoding: 'utf8', timeout: 3000 });
          if (check.status === 0 && check.stdout) {
            console.log('Using bundled node:', bundledNode, check.stdout.trim());
            return bundledNode;
          }
        } catch (e) {
          console.warn('Bundled node test failed:', e.message);
        }
      } else {
        console.log('Bundled node not found at:', bundledNode);
      }
      
      // try system node
      try {
        const check2 = spawnSync('node', ['-v'], { encoding: 'utf8', timeout: 3000 });
        if (check2.status === 0 && check2.stdout) {
          console.log('Using system node:', check2.stdout.trim());
          return 'node';
        }
      } catch (e) {
        console.warn('System node test failed:', e.message);
      }
      
      return null;
    }

    const nodeBinary = resolveNodeBinary();
    if (!nodeBinary) {
      console.error('Node runtime not found (bundled or system).');
      reject(new Error('Node runtime not found'));
      return;
    }

    nextProcess = spawn(nodeBinary, [nextServerPath], {
      env: { 
        ...process.env, 
        PORT: FRONTEND_PORT.toString(),
        HOSTNAME: 'localhost'
      },
      cwd: serverDir
    });
    
    nextProcess.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
      if (data.toString().includes('ready') || data.toString().includes('started')) {
        resolve();
      }
    });
    
    nextProcess.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
      if (data.toString().includes('EADDRINUSE')) {
        console.error('Port conflict detected!');
      }
    });
    
    nextProcess.on('close', (code) => {
      console.log(`Next.js process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js exited with code ${code}`));
      }
    });
    
    setTimeout(() => resolve(), 8000);
  });
}

async function waitForServer(url, maxRetries = 30) {
  // keep for backward compatibility but prefer waitForPort in most callers
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch (error) {
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = new net.Socket();
      let done = false;
      socket.setTimeout(2000);
      socket.once('connect', () => {
        done = true;
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tryConnect, 500);
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tryConnect, 500);
      });
      socket.connect(port, host);
    }
    tryConnect();
  });
}

async function createWindow() {
  try {
    BACKEND_PORT = await findFreePort(BACKEND_PORT);
    console.log(`Using backend port: ${BACKEND_PORT}`);
    // Show splash window immediately
    const splash = new BrowserWindow({
      width: 460,
      height: 240,
      frame: false,
      alwaysOnTop: true,
      center: true,
      resizable: false,
      transparent: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    splash.loadFile(path.join(__dirname, 'loading.html'))
      .catch(err => console.error('Failed to load splash:', err));

    function updateSplash(text) {
      try {
        splash.webContents.executeJavaScript(`window.updateStatus(${JSON.stringify(text)})`);
      } catch (e) {
        console.warn('Cannot update splash status', e);
      }
    }

    updateSplash('Starting backend...');
    await startBackend();
    updateSplash('Waiting for backend...');
    try {
      await waitForPort(BACKEND_PORT, '127.0.0.1', 20000);
    } catch (e) {
      console.warn('Backend port probe timed out, continuing to wait via HTTP');
      await waitForServer(`http://localhost:${BACKEND_PORT}/docs`);
    }

    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev) {
      updateSplash('Starting frontend server...');
      await startNextServer();
      updateSplash('Waiting for frontend...');
      try {
        await waitForPort(FRONTEND_PORT, '127.0.0.1', 20000);
      } catch (e) {
        console.warn('Frontend port probe timed out, continuing to wait via HTTP');
        await waitForServer(`http://localhost:${FRONTEND_PORT}`);
      }
    }

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });
    
    const url = `http://localhost:${FRONTEND_PORT}`;
    
    console.log(`Loading URL: ${url}`);
    
    win.loadURL(url);
    // close splash once main window is loading
    try { splash.close(); } catch (e) {}
    
    if (isDev) {
      win.webContents.openDevTools();
    }
    
    let loadAttempts = 0;
    const maxLoadAttempts = 3;
    win.webContents.on('did-fail-load', async (event, errorCode, errorDescription) => {
      console.error(`Failed to load (attempt ${loadAttempts + 1}): ${errorDescription}`);
      if (loadAttempts < maxLoadAttempts) {
        loadAttempts++;
        // brief wait then reload
        await new Promise(r => setTimeout(r, 1000 * loadAttempts));
        try {
          await waitForPort(FRONTEND_PORT, '127.0.0.1', 10000);
        } catch (e) {
          // ignore and attempt HTTP-based probe
          await waitForServer(`http://localhost:${FRONTEND_PORT}`);
        }
        win.reload();
        return;
      }
      win.loadURL(`data:text/html,<h1>Failed to load application</h1><p>${errorDescription}</p><p>Backend: http://localhost:${BACKEND_PORT}</p><p>Frontend: http://localhost:${FRONTEND_PORT}</p>`);
    });
  } catch (error) {
    console.error('Error creating window:', error);
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (nextProcess) {
    nextProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (nextProcess) {
    nextProcess.kill();
  }
});