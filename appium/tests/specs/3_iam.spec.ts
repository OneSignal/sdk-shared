import { checkInAppMessage, waitForAppReady } from '../helpers/app';

describe('In-App Messaging', () => {
  before(async () => {
    await waitForAppReady();
  });

  const iamTypes = [
    { buttonLabel: 'TOP BANNER', expectedTitle: 'Top Banner' },
    { buttonLabel: 'BOTTOM BANNER', expectedTitle: 'Bottom Banner' },
    { buttonLabel: 'CENTER MODAL', expectedTitle: 'Center Modal' },
    { buttonLabel: 'FULL SCREEN', expectedTitle: 'Full Screen' },
  ];

  for (const iam of iamTypes) {
    it(`can show ${iam.expectedTitle}`, async () => {
      await checkInAppMessage(iam);
    });
  }
});
