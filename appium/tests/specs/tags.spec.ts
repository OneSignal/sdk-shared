import { waitForAppReady, addTag, clearLogs } from "../helpers/app.js";
import { byTestId, byText } from "../helpers/selectors.js";
import { waitForLog } from "../helpers/logger.js";

describe("Tags", () => {
  before(async () => {
    await waitForAppReady();
  });

  it("should display the tags section", async () => {
    const tagsSection = await byText("Tags");
    await tagsSection.scrollIntoView();
    const isDisplayed = await tagsSection.isDisplayed();
    expect(isDisplayed).toBe(true);
  });

  // it('should show empty state when no tags exist', async () => {
  //   const emptyState = await byTestId('tags_empty');
  //   const isDisplayed = await emptyState.isDisplayed();
  //   expect(isDisplayed).toBe(true);
  // });

  // it('should add a tag and see it in the list', async () => {
  //   await clearLogs();
  //   await addTag('e2e_key', 'e2e_value');
  //   await waitForLog('tag', 10_000);

  //   const emptyState = await byTestId('tags_empty');
  //   const isDisplayed = await emptyState.isDisplayed().catch(() => false);
  //   expect(isDisplayed).toBe(false);
  // });
});
