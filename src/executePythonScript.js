const { spawn } = require('child_process');

function executePythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    // 尝试可能的Python命令
    const pythonCommands = ['python3', 'python'];
    let currentCommandIndex = 0;

    function tryExecute() {
      if (currentCommandIndex >= pythonCommands.length) {
        reject(new Error('No Python interpreter found. Please install Python 3.'));
        return;
      }

      const pythonCommand = pythonCommands[currentCommandIndex];
      const pythonProcess = spawn(pythonCommand, [scriptPath, ...args]);

      let scriptOutput = '';
      let scriptError = '';

      pythonProcess.stdout.on('data', (data) => {
        scriptOutput += data.toString();
        console.log(`Python stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        scriptError += data.toString();
        console.error(`Python stderr: ${data}`);
      });

      pythonProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          // 如果当前命令不存在，尝试下一个命令
          currentCommandIndex++;
          tryExecute();
        } else {
          reject(error);
        }
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(`Child process exited with code ${code}. Error: ${scriptError}`);
        } else {
          resolve(scriptOutput);
        }
      });
    }

    tryExecute();
  });
}

module.exports = executePythonScript;