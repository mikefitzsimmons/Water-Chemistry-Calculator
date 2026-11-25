function signature(state) {
  return JSON.stringify(state, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    }
    return value;
  });
}

export function createHistory(initial) {
  const previous = [];
  const future = [];
  let current = { snapshot: structuredClone(initial), signature: signature(initial) };

  function move(from, to) {
    if (from.length === 0) return null;
    to.push(current);
    current = from.pop();
    return structuredClone(current.snapshot);
  }

  return {
    get canUndo() { return previous.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(state) {
      const key = signature(state);
      if (key === current.signature) return false;
      previous.push(current);
      current = { snapshot: structuredClone(state), signature: key };
      future.length = 0;
      return true;
    },
    undo() { return move(previous, future); },
    redo() { return move(future, previous); }
  };
}
