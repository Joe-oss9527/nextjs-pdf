import { jest } from '@jest/globals';
import { PandocPDFService } from '../../src/services/PandocPDFService.js';
import { ValidationError, ProcessingError } from '../../src/utils/errors.js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn()
}));

// Mock the logger module to avoid fs issues
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('PandocPDFService', () => {
  let service;
  let mockConfig;
  let mockFileService;
  let mockPathService;
  let mockProcess;
  let mockStdout;
  let mockStderr;

  beforeEach(() => {
    // Create mock process
    mockStdout = new EventEmitter();
    mockStderr = new EventEmitter();
    mockProcess = new EventEmitter();
    mockProcess.stdout = mockStdout;
    mockProcess.stderr = mockStderr;

    mockConfig = {
      pdf: {
        pandoc: {
          pdfEngine: 'weasyprint',
          cssFile: 'src/styles/pdf.css',
          options: ['--standalone', '--self-contained']
        }
      },
      python: {
        executable: './venv/bin/python'
      }
    };

    mockFileService = {
      ensureDirectory: jest.fn()
    };

    mockPathService = {
      getTempDirectory: jest.fn().mockResolvedValue('/tmp/pdf-temp')
    };

    service = new PandocPDFService(mockConfig, mockFileService, mockPathService);
    
    // Reset all mocks
    spawn.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(service.config).toBe(mockConfig);
      expect(service.fileService).toBe(mockFileService);
      expect(service.pathService).toBe(mockPathService);
      expect(service.pandocConfig).toBe(mockConfig.pdf.pandoc);
    });

    it('should use defaults when pandoc config is missing', () => {
      const configWithoutPandoc = { pdf: {} };
      const serviceWithDefaults = new PandocPDFService(configWithoutPandoc, mockFileService, mockPathService);
      
      expect(serviceWithDefaults.pandocConfig).toEqual({});
      expect(serviceWithDefaults.defaults.pdfEngine).toBe('weasyprint');
    });
  });

  describe('getWeasyprintCommand', () => {
    it('should return venv weasyprint path when using venv', () => {
      const command = service.getWeasyprintCommand();
      expect(command).toBe('./venv/bin/weasyprint');
    });

    it('should return system weasyprint when not using venv', () => {
      service.config.python.executable = '/usr/bin/python';
      const command = service.getWeasyprintCommand();
      expect(command).toBe('weasyprint');
    });

    it('should handle missing python config', () => {
      service.config.python = undefined;
      const command = service.getWeasyprintCommand();
      expect(command).toBe('./venv/bin/weasyprint');
    });
  });

  describe('runCommand', () => {
    it('should run command successfully', async () => {
      const resultPromise = service.runCommand('pandoc', ['--version']);
      
      // Simulate successful command execution
      setImmediate(() => {
        mockStdout.emit('data', 'pandoc 2.19.2\n');
        mockProcess.emit('close', 0);
      });

      const result = await resultPromise;
      expect(result).toBe('pandoc 2.19.2\n');
      expect(spawn).toHaveBeenCalledWith('pandoc', ['--version'], expect.any(Object));
    });

    it('should handle command failure', async () => {
      const resultPromise = service.runCommand('pandoc', ['--invalid']);
      
      // Simulate command failure
      setImmediate(() => {
        mockStderr.emit('data', 'Unknown option: --invalid\n');
        mockProcess.emit('close', 1);
      });

      await expect(resultPromise).rejects.toThrow('Command failed with code 1: Unknown option: --invalid\n');
    });

    it('should handle spawn errors', async () => {
      const resultPromise = service.runCommand('nonexistent', []);
      
      // Simulate spawn error
      setImmediate(() => {
        mockProcess.emit('error', new Error('Command not found'));
      });

      await expect(resultPromise).rejects.toThrow('Failed to start command: Command not found');
    });

    it('should pass options to spawn', async () => {
      const options = { env: { PATH: '/custom/path' } };
      const resultPromise = service.runCommand('echo', ['test'], options);
      
      setImmediate(() => {
        mockStdout.emit('data', 'test\n');
        mockProcess.emit('close', 0);
      });

      await resultPromise;
      expect(spawn).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      }));
    });
  });

  describe('checkDependencies', () => {
    it('should detect available dependencies', async () => {
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc) // pandoc check
        .mockReturnValueOnce(mockProcessWeasy); // weasyprint check

      const checkPromise = service.checkDependencies();

      // Simulate pandoc version output
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      // Wait for next spawn call
      await new Promise(resolve => setTimeout(resolve, 20));

      // Simulate weasyprint version output
      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      const result = await checkPromise;

      expect(result).toEqual({
        available: true,
        pandoc: {
          version: '2.19.2',
          available: true
        },
        weasyprint: {
          version: '57.2',
          available: true,
          command: './venv/bin/weasyprint'
        }
      });
    });

    it('should handle missing dependencies', async () => {
      spawn.mockReturnValueOnce(mockProcess);

      const checkPromise = service.checkDependencies();

      // Simulate command failure
      setImmediate(() => {
        mockStderr.emit('data', 'Command not found\n');
        mockProcess.emit('close', 127);
      });

      const result = await checkPromise;

      expect(result).toEqual({
        available: false,
        error: expect.any(String),
        pandoc: { available: false },
        weasyprint: { available: false }
      });
    });
  });

  describe('prepareCSSFile', () => {
    it('should use existing CSS file', async () => {
      fs.access.mockResolvedValue();

      const cssPath = await service.prepareCSSFile();

      expect(cssPath).toBe(path.resolve('src/styles/pdf.css'));
      expect(fs.access).toHaveBeenCalledWith(path.resolve('src/styles/pdf.css'));
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should create default CSS file if missing', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const cssPath = await service.prepareCSSFile();

      expect(cssPath).toBe(path.resolve('src/styles/pdf.css'));
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(path.resolve('src/styles/pdf.css')), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('src/styles/pdf.css'),
        expect.stringContaining('Pandoc PDF专用样式'),
        'utf-8'
      );
    });

    it('should use custom CSS path from config', async () => {
      service.pandocConfig.cssFile = 'custom/styles/pdf.css';
      fs.access.mockResolvedValue();

      const cssPath = await service.prepareCSSFile();

      expect(cssPath).toBe(path.resolve('custom/styles/pdf.css'));
    });
  });

  describe('extractOriginalStyles', () => {
    let mockPage;

    beforeEach(() => {
      mockPage = {
        evaluate: jest.fn()
      };
    });

    it('should extract page styles successfully', async () => {
      const mockStyles = {
        inline: 'body { color: red; }',
        external: '.class { background: blue; }',
        computed: 'font-size: 16px;'
      };

      mockPage.evaluate.mockResolvedValue(mockStyles);

      const styles = await service.extractOriginalStyles(mockPage);

      expect(styles).toEqual(mockStyles);
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle extraction errors gracefully', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Evaluation failed'));

      const styles = await service.extractOriginalStyles(mockPage);

      expect(styles).toEqual({
        inline: '',
        external: '',
        computed: ''
      });
    });
  });

  describe('createEnhancedHTML', () => {
    it('should create enhanced HTML with original styles', async () => {
      const htmlContent = '<div>Test content</div>';
      const originalStyles = {
        inline: 'body { color: red; }',
        external: '.class { background: blue; }'
      };

      const enhancedHTML = await service.createEnhancedHTML(htmlContent, originalStyles);

      expect(enhancedHTML).toContain('<!DOCTYPE html>');
      expect(enhancedHTML).toContain(htmlContent);
      expect(enhancedHTML).toContain(originalStyles.inline);
      expect(enhancedHTML).toContain(originalStyles.external);
      expect(enhancedHTML).toContain('PDF增强样式');
    });

    it('should handle missing original styles', async () => {
      const htmlContent = '<div>Test content</div>';

      const enhancedHTML = await service.createEnhancedHTML(htmlContent);

      expect(enhancedHTML).toContain('<!DOCTYPE html>');
      expect(enhancedHTML).toContain(htmlContent);
      expect(enhancedHTML).toContain('PDF增强样式');
    });
  });

  describe('generatePDF', () => {
    beforeEach(() => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
      fs.stat.mockResolvedValue({ size: 1024 * 1024 });
      fs.access.mockResolvedValue(); // CSS file exists
    });

    it('should generate PDF successfully', async () => {
      // Create separate mock processes for each command
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();
      
      const mockProcessGenerate = new EventEmitter();
      mockProcessGenerate.stdout = new EventEmitter();
      mockProcessGenerate.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc) // checkDependencies - pandoc
        .mockReturnValueOnce(mockProcessWeasy) // checkDependencies - weasyprint
        .mockReturnValueOnce(mockProcessGenerate); // actual pandoc command

      const generatePromise = service.generatePDF('<html>Test</html>', '/output/test.pdf');

      // Simulate dependency checks
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Simulate successful PDF generation
      setImmediate(() => {
        mockProcessGenerate.stdout.emit('data', 'Processing...\n');
        mockProcessGenerate.emit('close', 0);
      });

      const result = await generatePromise;

      expect(result).toEqual({
        success: true,
        outputPath: '/output/test.pdf',
        fileSize: 1024 * 1024,
        engine: 'pandoc'
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('temp_'),
        '<html>Test</html>',
        'utf-8'
      );

      expect(spawn).toHaveBeenLastCalledWith('pandoc', [
        expect.stringContaining('temp_'),
        '-o', '/output/test.pdf',
        '--pdf-engine=weasyprint',
        expect.stringContaining('--css='),
        '--standalone',
        '--self-contained'
      ], expect.any(Object));
    });

    it('should handle PDF generation failure', async () => {
      // Create separate mock processes
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();
      
      const mockProcessGenerate = new EventEmitter();
      mockProcessGenerate.stdout = new EventEmitter();
      mockProcessGenerate.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc)
        .mockReturnValueOnce(mockProcessWeasy)
        .mockReturnValueOnce(mockProcessGenerate);

      const generatePromise = service.generatePDF('<html>Test</html>', '/output/test.pdf');

      // Simulate dependency checks
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Simulate PDF generation failure
      setImmediate(() => {
        mockProcessGenerate.stderr.emit('data', 'PDF generation failed\n');
        mockProcessGenerate.emit('close', 1);
      });

      await expect(generatePromise).rejects.toThrow(ProcessingError);
    });

    it('should throw if dependencies are unavailable', async () => {
      spawn.mockReturnValueOnce(mockProcess);
      
      const generatePromise = service.generatePDF('<html>Test</html>', '/output/test.pdf');
      
      setImmediate(() => {
        mockStderr.emit('data', 'Command not found\n');
        mockProcess.emit('close', 127);
      });

      await expect(generatePromise).rejects.toThrow(ProcessingError);
    });

    it('should set correct environment for weasyprint in venv', async () => {
      // Create separate mock processes
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();
      
      const mockProcessGenerate = new EventEmitter();
      mockProcessGenerate.stdout = new EventEmitter();
      mockProcessGenerate.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc)
        .mockReturnValueOnce(mockProcessWeasy)
        .mockReturnValueOnce(mockProcessGenerate);

      const generatePromise = service.generatePDF('<html>Test</html>', '/output/test.pdf');

      // Simulate dependency checks
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessGenerate.emit('close', 0);
      });
      
      await generatePromise;

      const lastSpawnCall = spawn.mock.calls[spawn.mock.calls.length - 1];
      const options = lastSpawnCall[2];

      expect(options.env.PATH).toContain('./venv/bin');
    });
  });

  describe('generatePDFFromPage', () => {
    let mockPage;

    beforeEach(() => {
      mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          inline: 'body { color: red; }',
          external: '.class { background: blue; }',
          computed: 'font-size: 16px;'
        })
      };

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
      fs.stat.mockResolvedValue({ size: 2 * 1024 * 1024 });
      fs.access.mockResolvedValue();
    });

    it('should generate PDF from page with enhanced styles', async () => {
      // Create separate mock processes
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();
      
      const mockProcessGenerate = new EventEmitter();
      mockProcessGenerate.stdout = new EventEmitter();
      mockProcessGenerate.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc)
        .mockReturnValueOnce(mockProcessWeasy)
        .mockReturnValueOnce(mockProcessGenerate);

      const generatePromise = service.generatePDFFromPage(
        mockPage,
        '<div>Content</div>',
        '/output/enhanced.pdf'
      );

      // Simulate dependency checks
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessGenerate.emit('close', 0);
      });

      const result = await generatePromise;

      expect(result).toEqual({
        success: true,
        outputPath: '/output/enhanced.pdf',
        fileSize: 2 * 1024 * 1024,
        engine: 'pandoc'
      });

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('原始页面样式'),
        'utf-8'
      );
    });

    it('should handle page evaluation errors', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Evaluation failed'));

      // Create separate mock processes
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();
      
      const mockProcessGenerate = new EventEmitter();
      mockProcessGenerate.stdout = new EventEmitter();
      mockProcessGenerate.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc)
        .mockReturnValueOnce(mockProcessWeasy)
        .mockReturnValueOnce(mockProcessGenerate);

      const generatePromise = service.generatePDFFromPage(
        mockPage,
        '<div>Content</div>',
        '/output/enhanced.pdf'
      );

      // Simulate dependency checks
      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessGenerate.emit('close', 0);
      });

      const result = await generatePromise;

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('batchGeneratePDFs', () => {
    beforeEach(() => {
      fs.readFile.mockImplementation((path) => {
        if (path.includes('file1')) return Promise.resolve('<html>Content 1</html>');
        if (path.includes('file2')) return Promise.resolve('<html>Content 2</html>');
        return Promise.reject(new Error('File not found'));
      });

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
      fs.stat.mockResolvedValue({ size: 1024 * 1024 });
      fs.access.mockResolvedValue();
    });

    it('should generate multiple PDFs', async () => {
      const htmlFiles = [
        { path: '/input/file1.html', name: 'file1' },
        { path: '/input/file2.html', name: 'file2' }
      ];

      // Create mock processes for each file generation
      const mockProcesses = [];
      
      // For each file, we need 3 processes: pandoc check, weasyprint check, and pdf generation
      for (let i = 0; i < htmlFiles.length * 3; i++) {
        const mockProc = new EventEmitter();
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();
        mockProcesses.push(mockProc);
        spawn.mockReturnValueOnce(mockProc);
      }

      const resultsPromise = service.batchGeneratePDFs(htmlFiles, '/output');

      // Simulate dependency checks and PDF generation for each file
      for (let i = 0; i < htmlFiles.length; i++) {
        const baseIndex = i * 3;
        
        // Pandoc check
        setImmediate(() => {
          mockProcesses[baseIndex].stdout.emit('data', 'pandoc 2.19.2\n');
          mockProcesses[baseIndex].emit('close', 0);
        });

        await new Promise(resolve => setTimeout(resolve, 30));

        // Weasyprint check
        setImmediate(() => {
          mockProcesses[baseIndex + 1].stdout.emit('data', 'WeasyPrint 57.2\n');
          mockProcesses[baseIndex + 1].emit('close', 0);
        });

        await new Promise(resolve => setTimeout(resolve, 30));

        // PDF generation
        setImmediate(() => {
          mockProcesses[baseIndex + 2].emit('close', 0);
        });

        await new Promise(resolve => setTimeout(resolve, 30));
      }

      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        success: true,
        sourcePath: '/input/file1.html',
        name: 'file1'
      });
      expect(results[1]).toMatchObject({
        success: true,
        sourcePath: '/input/file2.html',
        name: 'file2'
      });
    });

    it('should handle partial failures', async () => {
      const htmlFiles = [
        { path: '/input/file1.html', name: 'file1' },
        { path: '/input/nonexistent.html', name: 'nonexistent' }
      ];

      // Create mock processes for first file only
      const mockProcesses = [];
      for (let i = 0; i < 3; i++) {
        const mockProc = new EventEmitter();
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();
        mockProcesses.push(mockProc);
        spawn.mockReturnValueOnce(mockProc);
      }

      const resultsPromise = service.batchGeneratePDFs(htmlFiles, '/output');

      // Simulate successful generation for first file
      setImmediate(() => {
        mockProcesses[0].stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcesses[0].emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 30));

      setImmediate(() => {
        mockProcesses[1].stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcesses[1].emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 30));

      setImmediate(() => {
        mockProcesses[2].emit('close', 0);
      });

      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return ready status when dependencies are available', async () => {
      const mockProcessPandoc = new EventEmitter();
      mockProcessPandoc.stdout = new EventEmitter();
      mockProcessPandoc.stderr = new EventEmitter();
      
      const mockProcessWeasy = new EventEmitter();
      mockProcessWeasy.stdout = new EventEmitter();
      mockProcessWeasy.stderr = new EventEmitter();

      spawn
        .mockReturnValueOnce(mockProcessPandoc)
        .mockReturnValueOnce(mockProcessWeasy);

      const statusPromise = service.getStatus();

      setImmediate(() => {
        mockProcessPandoc.stdout.emit('data', 'pandoc 2.19.2\n');
        mockProcessPandoc.emit('close', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      setImmediate(() => {
        mockProcessWeasy.stdout.emit('data', 'WeasyPrint 57.2\n');
        mockProcessWeasy.emit('close', 0);
      });

      const status = await statusPromise;

      expect(status).toEqual({
        name: 'PandocPDFService',
        status: 'ready',
        dependencies: expect.objectContaining({
          available: true
        }),
        config: {
          engine: 'weasyprint',
          cssFile: 'src/styles/pdf.css',
          options: ['--standalone', '--self-contained']
        }
      });
    });

    it('should return unavailable status when dependencies are missing', async () => {
      spawn.mockReturnValueOnce(mockProcess);
      
      const statusPromise = service.getStatus();
      
      setImmediate(() => {
        mockStderr.emit('data', 'Command not found\n');
        mockProcess.emit('close', 127);
      });

      const status = await statusPromise;

      expect(status.status).toBe('unavailable');
      expect(status.dependencies.available).toBe(false);
    });
  });

  describe('getDefaultPandocCSS', () => {
    it('should return default CSS content', () => {
      const css = service.getDefaultPandocCSS();

      expect(css).toContain('@page');
      expect(css).toContain('font-family');
      expect(css).toContain('h1, h2, h3');
      expect(css).toContain('pre');
      expect(css).toContain('code');
    });
  });

  describe('getEnhancedPDFCSS', () => {
    it('should return enhanced PDF CSS', async () => {
      const css = await service.getEnhancedPDFCSS();

      expect(css).toContain('PDF增强样式');
      expect(css).toContain('@page');
      expect(css).toContain('深色主题强制转换为浅色');
      expect(css).toContain('代码块样式优化');
      expect(css).toContain('@media print');
    });
  });

  describe('dispose', () => {
    it('should log cleanup message', async () => {
      await service.dispose();
      
      expect(service.logger.info).toHaveBeenCalledWith('PandocPDFService已清理');
    });
  });
});