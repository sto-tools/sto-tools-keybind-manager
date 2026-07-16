/**
 * @param {import('./SelectionService.js').default} service
 * @param {string} name
 */
export async function handleSelectedAliasDeleted(service, name) {
  service._lastDeletedAlias = name;
  if (service.cache.selectedAlias !== name) return;

  service.cache.selectedAlias = null;
  service.setCachedSelection("alias", null);
  if (service.cache.aliases?.[name]) delete service.cache.aliases[name];
  if (service.cache.profile?.aliases?.[name]) {
    delete service.cache.profile.aliases[name];
  }

  service.broadcastState();
  service.emit("alias-selected", { name: null, source: "SelectionService" });
  if (service.selectionEnvironment === "alias") {
    await service.autoSelectFirst("alias");
  }
}

/**
 * @param {import('./SelectionService.js').default} service
 * @param {string} keyName
 */
export async function handleSelectedKeyDeleted(service, keyName) {
  service._lastDeletedKey = keyName;
  if (service.cache.selectedKey !== keyName) return;

  service.cache.selectedKey = null;
  if (service.cache.builds) {
    for (const [environment, build] of Object.entries(service.cache.builds)) {
      if (build.keys?.[keyName]) {
        delete build.keys[keyName];
        service.setCachedSelection(environment, null);
      }
    }
  }
  if (service.cache.keys?.[keyName]) {
    delete service.cache.keys[keyName];
    service.setCachedSelection(service.selectionEnvironment, null);
  }

  service.broadcastState();
  service.emit("key-selected", { key: null, source: "SelectionService" });
  if (service.selectionEnvironment !== "alias") {
    await service.autoSelectFirst(service.selectionEnvironment);
  }
}
