describe.skip('Debug', () => {
  it('log ui hierarchy', async () => {
    const html = await driver.getPageSource();
    console.log(html);
  });
  // it('can debug', async () => {
  //   await scrollToTop();
  // });
});
