import { jest } from '@jest/globals';
import { 
  setupContainer, 
  createContainer, 
  getContainerHealth, 
  shutdownContainer 
} from '../../src/core/setup.js';
import Container from '../../src/core/container.js';

// Mock all dependencies
jest.mock('../../src/core/container.js');
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: jest.fn((name) => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    name
  }))
}));
jest.mock('../../src/config/configValidator.js', () => ({
  validateConfig: jest.fn()
}));

// Mock all service classes
jest.mock('../../src/config/configLoader.js', () => ({
  ConfigLoader: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue({ test: true })
  }))
}));
jest.mock('../../src/services/fileService.js', () => ({
  FileService: jest.fn()
}));
jest.mock('../../src/services/pathService.js', () => ({
  PathService: jest.fn()
}));
jest.mock('../../src/services/metadataService.js', () => ({
  MetadataService: jest.fn()
}));
jest.mock('../../src/services/stateManager.js', () => ({
  StateManager: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue()
  }))
}));
jest.mock('../../src/services/progressTracker.js', () => ({
  ProgressTracker: jest.fn()
}));
jest.mock('../../src/services/queueManager.js', () => ({
  QueueManager: jest.fn()
}));
jest.mock('../../src/services/browserPool.js', () => ({
  BrowserPool: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue()
  }))
}));
jest.mock('../../src/services/pageManager.js', () => ({
  PageManager: jest.fn()
}));
jest.mock('../../src/services/imageService.js', () => ({
  ImageService: jest.fn()
}));
jest.mock('../../src/services/pdfStyleService.js', () => ({
  PDFStyleService: jest.fn()
}));
jest.mock('../../src/core/scraper.js', () => ({
  Scraper: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue()
  }))
}));
jest.mock('../../src/services/PythonMergeService.js', () => ({
  PythonMergeService: jest.fn()
}));

describe('setup', () => {
  let mockContainer;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock container
    mockContainer = {
      register: jest.fn(),
      get: jest.fn().mockResolvedValue({}),
      validateDependencies: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        registeredServices: 15,
        instances: 5,
        singletons: 15
      }),
      getHealth: jest.fn().mockReturnValue({
        healthy: true,
        services: []
      }),
      dispose: jest.fn().mockResolvedValue()
    };

    Container.mockImplementation(() => mockContainer);
  });

  describe('setupContainer', () => {
    it('should create and configure container successfully', async () => {
      const container = await setupContainer();

      expect(container).toBe(mockContainer);
      expect(Container).toHaveBeenCalledTimes(1);
      
      // Verify all services are registered
      expect(mockContainer.register).toHaveBeenCalledWith('config', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: [],
        lifecycle: 'singleton'
      }));
      
      expect(mockContainer.register).toHaveBeenCalledWith('logger', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: [],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('fileService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('pathService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('metadataService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['fileService', 'pathService', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('stateManager', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['fileService', 'pathService', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('progressTracker', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('queueManager', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('browserPool', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('pageManager', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['browserPool', 'config', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('imageService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config', 'logger'],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('pdfStyleService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config'],
        lifecycle: 'singleton'
      }));


      expect(mockContainer.register).toHaveBeenCalledWith('scraper', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: [
          'config',
          'logger',
          'browserPool',
          'pageManager',
          'fileService',
          'pathService',
          'metadataService',
          'stateManager',
          'progressTracker',
          'queueManager',
          'imageService',
          'pdfStyleService'
        ],
        lifecycle: 'singleton'
      }));

      expect(mockContainer.register).toHaveBeenCalledWith('pythonMergeService', expect.any(Function), expect.objectContaining({
        singleton: true,
        dependencies: ['config', 'logger'],
        lifecycle: 'singleton'
      }));

      // Verify total number of services registered
      expect(mockContainer.register).toHaveBeenCalledTimes(14);

      // Verify validation and preloading
      expect(mockContainer.validateDependencies).toHaveBeenCalled();
      expect(mockContainer.get).toHaveBeenCalledWith('config');
      expect(mockContainer.get).toHaveBeenCalledWith('logger');
      expect(mockContainer.get).toHaveBeenCalledWith('fileService');
      expect(mockContainer.get).toHaveBeenCalledWith('pathService');
      
      // Verify stats were retrieved
      expect(mockContainer.getStats).toHaveBeenCalled();
    });

    it('should handle setup errors and dispose container', async () => {
      const setupError = new Error('Setup failed');
      mockContainer.validateDependencies.mockImplementation(() => {
        throw setupError;
      });

      await expect(setupContainer()).rejects.toThrow('Setup failed');
      
      // Verify cleanup was attempted
      expect(mockContainer.dispose).toHaveBeenCalled();
    });

    it('should log error if disposal fails during setup error', async () => {
      const setupError = new Error('Setup failed');
      const disposeError = new Error('Dispose failed');
      
      mockContainer.validateDependencies.mockImplementation(() => {
        throw setupError;
      });
      mockContainer.dispose.mockRejectedValue(disposeError);

      await expect(setupContainer()).rejects.toThrow('Setup failed');
      
      // Verify both errors were handled
      expect(mockContainer.dispose).toHaveBeenCalled();
    });

    it('should create services with correct configurations', async () => {
      // First call setupContainer to populate the mock calls
      await setupContainer();

      // Test config service factory
      const configFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'config'
      )[1];
      
      const { ConfigLoader } = await import('../../src/config/configLoader.js');
      const { validateConfig } = await import('../../src/config/configValidator.js');
      
      const config = await configFactory();
      expect(ConfigLoader).toHaveBeenCalled();
      expect(validateConfig).toHaveBeenCalledWith({ test: true });

      // Test logger service factory
      const loggerFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'logger'
      )[1];
      
      const logger = loggerFactory();
      expect(logger.name).toBe('App');

      // Test fileService factory
      const fileServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'fileService'
      )[1];
      
      const { FileService } = await import('../../src/services/fileService.js');
      const mockLoggerService = { name: 'test' };
      fileServiceFactory(mockLoggerService);
      expect(FileService).toHaveBeenCalledWith(mockLoggerService);

      // Test pathService factory
      const pathServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'pathService'
      )[1];
      
      const { PathService } = await import('../../src/services/pathService.js');
      const mockConfig = { outputDir: 'test' };
      pathServiceFactory(mockConfig);
      expect(PathService).toHaveBeenCalledWith(mockConfig);

      // Test queueManager factory with config
      const queueManagerFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'queueManager'
      )[1];
      
      const { QueueManager } = await import('../../src/services/queueManager.js');
      queueManagerFactory({ concurrency: 10 }, mockLoggerService);
      expect(QueueManager).toHaveBeenCalledWith({
        concurrency: 10,
        logger: mockLoggerService
      });

      // Test imageService factory with config
      const imageServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'imageService'
      )[1];
      
      const { ImageService } = await import('../../src/services/imageService.js');
      imageServiceFactory({ imageTimeout: 20000 }, mockLoggerService);
      expect(ImageService).toHaveBeenCalledWith({
        defaultTimeout: 20000,
        logger: mockLoggerService
      });

      // Test pdfStyleService factory with config
      const pdfStyleServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'pdfStyleService'
      )[1];
      
      const { PDFStyleService } = await import('../../src/services/pdfStyleService.js');
      pdfStyleServiceFactory({
        pdf: {
          theme: 'dark',
          fontSize: '16px',
          preserveCodeHighlighting: false
        }
      });
      expect(PDFStyleService).toHaveBeenCalledWith({
        theme: 'dark',
        preserveCodeHighlighting: false,
        enableCodeWrap: true,
        fontSize: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        codeFont: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'
      });

      // Test scraper factory
      const scraperFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'scraper'
      )[1];
      
      const { Scraper } = await import('../../src/core/scraper.js');
      const services = [
        mockConfig,
        mockLoggerService,
        'browserPool',
        'pageManager',
        'fileService',
        'pathService',
        'metadataService',
        'stateManager',
        'progressTracker',
        'queueManager',
        'imageService',
        'pdfStyleService'
      ];
      
      await scraperFactory(...services);
      expect(Scraper).toHaveBeenCalledWith({
        config: mockConfig,
        logger: mockLoggerService,
        browserPool: 'browserPool',
        pageManager: 'pageManager',
        fileService: 'fileService',
        pathService: 'pathService',
        metadataService: 'metadataService',
        stateManager: 'stateManager',
        progressTracker: 'progressTracker',
        queueManager: 'queueManager',
        imageService: 'imageService',
        pdfStyleService: 'pdfStyleService'
      });
    });
  });

  describe('createContainer', () => {
    it('should call setupContainer', async () => {
      const container = await createContainer();
      
      expect(container).toBe(mockContainer);
      expect(Container).toHaveBeenCalledTimes(1);
    });
  });

  describe('getContainerHealth', () => {
    it('should return container health information', () => {
      const health = getContainerHealth(mockContainer);
      
      expect(health).toEqual({
        healthy: true,
        services: []
      });
      expect(mockContainer.getHealth).toHaveBeenCalled();
    });
  });

  describe('shutdownContainer', () => {
    it('should dispose container successfully', async () => {
      await shutdownContainer(mockContainer);
      
      expect(mockContainer.dispose).toHaveBeenCalled();
    });

    it('should handle disposal errors', async () => {
      const disposeError = new Error('Disposal failed');
      mockContainer.dispose.mockRejectedValue(disposeError);
      
      await expect(shutdownContainer(mockContainer)).rejects.toThrow('Disposal failed');
    });
  });

  describe('service factory edge cases', () => {
    it('should handle missing config values with defaults', async () => {
      await setupContainer();

      // Test queueManager with no concurrency
      const queueManagerFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'queueManager'
      )[1];
      
      const { QueueManager } = await import('../../src/services/queueManager.js');
      queueManagerFactory({}, {});
      expect(QueueManager).toHaveBeenCalledWith({
        concurrency: 5,
        logger: {}
      });

      // Test imageService with no timeout
      const imageServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'imageService'
      )[1];
      
      const { ImageService } = await import('../../src/services/imageService.js');
      imageServiceFactory({}, {});
      expect(ImageService).toHaveBeenCalledWith({
        defaultTimeout: 15000,
        logger: {}
      });

      // Test pdfStyleService with empty config
      const pdfStyleServiceFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'pdfStyleService'
      )[1];
      
      const { PDFStyleService } = await import('../../src/services/pdfStyleService.js');
      pdfStyleServiceFactory({});
      expect(PDFStyleService).toHaveBeenCalledWith({
        theme: 'light',
        preserveCodeHighlighting: true,
        enableCodeWrap: true,
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        codeFont: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'
      });
    });

    it('should handle async service factories', async () => {
      await setupContainer();

      // Test stateManager async factory
      const stateManagerFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'stateManager'
      )[1];
      
      const { StateManager } = await import('../../src/services/stateManager.js');
      const stateManager = await stateManagerFactory('file', 'path', 'logger');
      
      expect(StateManager).toHaveBeenCalledWith('file', 'path', 'logger');
      expect(stateManager.load).toHaveBeenCalled();

      // Test browserPool async factory
      const browserPoolFactory = mockContainer.register.mock.calls.find(
        call => call[0] === 'browserPool'
      )[1];
      
      const { BrowserPool } = await import('../../src/services/browserPool.js');
      const browserPool = await browserPoolFactory({ concurrency: 3 }, 'logger');
      
      expect(BrowserPool).toHaveBeenCalledWith({
        maxBrowsers: 3,
        headless: true,
        logger: 'logger'
      });
      expect(browserPool.initialize).toHaveBeenCalled();
    });
  });
});