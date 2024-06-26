const { spawn } = require('child_process');

const config = require('./configLoader');

function executePythonScript(scriptPath, args = []) {
  const configArg = JSON.stringify(config);
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath, configArg, ...args]);

    let scriptOutput = '';
    let scriptError = '';

    pythonProcess.stdout.on('data', (data) => {
      scriptOutput += data.toString();
      console.log(`Python stdout: ${data}`);  // 实时输出 Python 的标准输出
    });

    pythonProcess.stderr.on('data', (data) => {
      scriptError += data.toString();
      console.error(`Python stderr: ${data}`);  // 实时输出 Python 的错误信息
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(`Child process exited with code ${code}. Error: ${scriptError}`);
      } else {
        resolve(scriptOutput);
      }
    });
  });
}

module.exports = executePythonScript;