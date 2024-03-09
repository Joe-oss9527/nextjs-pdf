const fs = require('fs').promises;
const { ensureDirectoryExists, cleanDirectory } = require('../fileUtils');

describe('fileUtils', () => {
    describe('ensureDirectoryExists', () => {
        it('should create directory if it does not exist', async () => {
            const dirPath = './test-dir';
            await ensureDirectoryExists(dirPath);
            const stats = await fs.stat(dirPath);
            expect(stats.isDirectory()).toBeTruthy();
            await fs.rm(dirPath, { recursive: true, force: true }); // clean up after test
        });
    });

    describe('cleanDirectory', () => {
        it('should remove directory if it exists', async () => {
            const dirPath = './test-dir';
            await fs.mkdir(dirPath);
            await cleanDirectory(dirPath);
            try {
                await fs.access(dirPath);
            } catch (error) {
                expect(error.code).toBe('ENOENT'); // expect error because directory should not exist
            }
        });
    });
});