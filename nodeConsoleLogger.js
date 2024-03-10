// 定义一个柯里化函数，这次它接受任意数量的参数
function createLogger(prefix) {
  return function(...args) {
    // 将所有参数转换为字符串并用逗号分隔
    const argsString = args.map(arg => JSON.stringify(arg)).join(', ');
    console.log(`${prefix} ${argsString}`);
  };
}

// 使用柯里化函数创建一个特定的日志函数
const nodeConsoleLogger = createLogger('[NodeConsole]');

// 使用这个日志函数，现在它可以接受任意数量的参数
// nodeConsoleLogger('已滚动的距离', 100, '总高度', 2000, '当前URL', 'http://example.com');

module.exports = { nodeConsoleLogger };