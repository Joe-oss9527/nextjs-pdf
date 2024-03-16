const { spawn } = require('child_process');

/**
 * 执行Python脚本并返回结果
 * @param {string} scriptPath - Python脚本的路径
 * @param {Array<string>} args - 传递给Python脚本的参数列表
 * @returns {Promise<string>} - 返回一个Promise，解析为Python脚本的输出
 */
function executePythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath, ...args]);

    let scriptOutput = '';
    pythonProcess.stdout.on('data', (data) => {
      scriptOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      reject(data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(`子进程退出，退出码 ${code}`);
      } else {
        resolve(scriptOutput);
      }
    });
  });
}

module.exports = executePythonScript;

