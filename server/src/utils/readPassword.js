import readline from 'node:readline';

export function readPassword(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') throw new Error('Run this command from an interactive terminal so the password can be entered privately.');
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write(prompt);
    const finish = (error) => {
      input.removeListener('keypress', onKey);
      input.setRawMode(wasRaw);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Password entry cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        return;
      }
      if (!key.ctrl && !key.meta && character) { value += character; process.stdout.write('*'); }
    };
    input.on('keypress', onKey);
  });
}
