export function createMainProjectRepositoryMock(bootstrap) {
  return {
    default: class {
      constructor(options) {
        bootstrap.projectRepository = { instance: this, options };
      }
      load() {}
      commit() {}
      reset() {}
      createSchemaMigrationPort() {
        return {};
      }
    },
  };
}

export function createMainPreferencesMock(bootstrap) {
  return {
    default: class extends bootstrap.ComponentStub {
      constructor(options) {
        super();
        bootstrap.preferencesOptions = options;
        this.initialStateReady = bootstrap.preferencesInitialStateReady;
        bootstrap.operations.push("preferences:construct");
      }
      init() {
        bootstrap.operations.push("preferences:init");
      }
      activateImportedSettings() {}
      destroy() {
        bootstrap.operations.push("preferences:destroy");
      }
    },
  };
}
