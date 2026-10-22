import type { RulesService } from '../rules/rules.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { mockOf } from '../testing/mocks.js';
import { SeedService } from './seed.service.js';

describe('SeedService', () => {
  it('seeds the default rules and settings when the app starts', async () => {
    const rules = mockOf<RulesService>();
    const settings = mockOf<SettingsService>();
    await new SeedService(rules, settings).onApplicationBootstrap();
    expect(rules.seedDefaults).toHaveBeenCalled();
    expect(settings.seedDefaults).toHaveBeenCalled();
  });
});
