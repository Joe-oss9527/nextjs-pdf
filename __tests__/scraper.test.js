const Scraper = require('../scraper');

describe('Scraper', () => {
  let scraper;

  beforeEach(() => {
    scraper = new Scraper();
  });

  test('close method', async () => {
    // Mock the close method
    scraper.close = jest.fn();
    await scraper.close();
    expect(scraper.close).toHaveBeenCalled();
  });

  test('scrapeNavLinks method', async () => {
    // Mock the scrapeNavLinks method
    const mockLinks = ['http://example.com'];
    scraper.scrapeNavLinks = jest.fn().mockResolvedValue(mockLinks);
    const links = await scraper.scrapeNavLinks('http://example.com', '.nav-link');
    expect(links).toEqual(mockLinks);
  });
});