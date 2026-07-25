const STATE_KEY = "marketfit.state.v2";
const LEGACY_KEYS = ["marketfit.profile.v1", "marketfit.lastAnalysis.v1"];
const DEFAULT_RETENTION_DAYS = 90;

export function createStorageService(storageArea, now = () => new Date()) {
  return {
    async initialize() {
      const current = (await storageArea.get(STATE_KEY))[STATE_KEY];
      if (current) {
        const cleaned = purgeExpired(current, now());
        if (cleaned !== current) await storageArea.set({ [STATE_KEY]: cleaned });
        return cleaned;
      }
      await storageArea.remove(LEGACY_KEYS);
      const state = defaultState(now());
      await storageArea.set({ [STATE_KEY]: state });
      return state;
    },
    async load() {
      const state = (await storageArea.get(STATE_KEY))[STATE_KEY] || defaultState(now());
      const cleaned = purgeExpired(state);
      if (cleaned !== state) await storageArea.set({ [STATE_KEY]: cleaned });
      return cleaned;
    },
    async saveProfile(profile, retentionDays = DEFAULT_RETENTION_DAYS) {
      const current = await this.load();
      const createdAt = current.savedProfile?.createdAt || now().toISOString();
      const expiresAt = new Date(now().getTime() + normalizeDays(retentionDays) * 86400000).toISOString();
      const next = {
        ...current,
        mode: "local_profile",
        savedProfile: { profile, createdAt, updatedAt: now().toISOString(), expiresAt },
        updatedAt: now().toISOString()
      };
      await storageArea.set({ [STATE_KEY]: next });
      return next;
    },
    async saveSettings(settings) {
      const current = await this.load();
      const next = { ...current, settings: { ...current.settings, ...settings, remoteAnalysisEnabled: false }, updatedAt: now().toISOString() };
      await storageArea.set({ [STATE_KEY]: next });
      return next;
    },
    async deleteAll() {
      await storageArea.remove([STATE_KEY, ...LEGACY_KEYS]);
    },
    async exportData() {
      const state = await this.load();
      return { schemaVersion: 2, exportedAt: now().toISOString(), mode: state.mode, savedProfile: state.savedProfile || null, settings: state.settings };
    }
  };
}

export function defaultState(date = new Date()) {
  return {
    schemaVersion: 2,
    mode: "temporary",
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    savedProfile: null,
    settings: { retentionDays: DEFAULT_RETENTION_DAYS, remoteAnalysisEnabled: false, remoteConsent: false }
  };
}

export function purgeExpired(state, date = new Date()) {
  if (!state?.savedProfile?.expiresAt || new Date(state.savedProfile.expiresAt) >= date) return state;
  return { ...state, mode: "temporary", savedProfile: null, updatedAt: date.toISOString() };
}

function normalizeDays(value) {
  const parsed = Number(value);
  return [30, 90, 365].includes(parsed) ? parsed : DEFAULT_RETENTION_DAYS;
}
