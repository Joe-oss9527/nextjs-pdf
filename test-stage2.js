// test-stage2.js
import { FileService } from './src/services/fileService.js';
import { PathService } from './src/services/pathService.js';
import { MetadataService } from './src/services/metadataService.js';
import { ConfigLoader } from './src/config/loader.js';
import { createLogger } from './src/utils/logger.js';
import path from 'path';

async function testStage2() {
  console.log('=== 测试第二阶段重构 ===\n');

  // 加载配置和创建日志器
  const configLoader = new ConfigLoader('./config.json');
  const config = await configLoader.load();
  const logger = await createLogger(config);

  // 创建服务实例
  const fileService = new FileService(logger);
  const pathService = new PathService(config);
  const metadataService = new MetadataService(fileService, pathService, logger);

  console.log('1. 测试FileService...');

  // 测试目录操作
  const testDir = path.join(config.pdfDir, 'test-dir');
  await fileService.ensureDirectory(testDir);
  console.log('✓ 创建目录成功');

  // 测试JSON操作
  const testJsonPath = path.join(testDir, 'test.json');
  const testData = { name: 'test', value: 123 };
  await fileService.writeJson(testJsonPath, testData);
  console.log('✓ 写入JSON成功');

  const readData = await fileService.readJson(testJsonPath);
  console.log('✓ 读取JSON成功:', readData);

  // 测试清理目录
  await fileService.cleanDirectory(testDir);
  console.log('✓ 清理目录成功');

  console.log('\n2. 测试PathService...');

  // 测试路径生成
  const testUrls = [
    'https://rc.nextjs.org/docs/app/getting-started',
    'https://rc.nextjs.org/docs/pages/api-routes',
    'https://rc.nextjs.org/docs/introduction'
  ];

  for (const url of testUrls) {
    const pdfPath = pathService.getPdfPath(url);
    console.log(`URL: ${url}`);
    console.log(`  PDF路径: ${pdfPath}`);
    console.log(`  目录: ${pathService.determineDirectory(url)}`);
  }

  // 测试元数据路径
  console.log('\n元数据路径:');
  console.log('  文章标题:', pathService.getMetadataPath('articleTitles'));
  console.log('  失败链接:', pathService.getMetadataPath('failed'));

  console.log('\n3. 测试MetadataService...');

  // 测试保存文章标题
  await metadataService.saveArticleTitle(0, 'Getting Started');
  await metadataService.saveArticleTitle(1, 'API Routes');
  console.log('✓ 保存文章标题成功');

  const titles = await metadataService.getArticleTitles();
  console.log('✓ 获取文章标题:', titles);

  // 测试失败链接记录
  await metadataService.logFailedLink(
    'https://example.com/fail',
    99,
    new Error('测试错误')
  );
  console.log('✓ 记录失败链接成功');

  const failedLinks = await metadataService.getFailedLinks();
  console.log('✓ 获取失败链接:', failedLinks.length, '个');

  // 测试图片加载失败记录
  await metadataService.logImageLoadFailure('https://example.com/image-fail', 50);
  console.log('✓ 记录图片加载失败成功');

  console.log('\n4. 测试兼容层...');

  // 动态导入兼容层
  const fileUtils = await import('./src/fileUtils.js');

  // 测试兼容函数
  const compatPdfPath = await fileUtils.getPdfPath(
    'https://rc.nextjs.org/docs/test',
    5,
    config.pdfDir
  );
  console.log('✓ 兼容层getPdfPath:', compatPdfPath);

  await fileUtils.saveArticleTitle(config.pdfDir, 2, 'Test Article');
  console.log('✓ 兼容层saveArticleTitle成功');

  // 测试新添加的removeFromFailedLinks函数
  await fileUtils.removeFromFailedLinks(config.pdfDir, 'https://example.com/fail');
  const updatedFailedLinks = await metadataService.getFailedLinks();
  console.log('✓ removeFromFailedLinks成功，剩余失败链接:', updatedFailedLinks.length);

  console.log('\n=== 测试完成 ===');

  // 清理测试数据
  await fileService.cleanDirectory(path.join(config.pdfDir, 'metadata'));
}

testStage2().catch(console.error);
