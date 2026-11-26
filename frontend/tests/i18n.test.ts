import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from '../src/i18n.ts';

test('Spanish localizes app navigation, account settings, and support labels', () => {
  assert.equal(translateText('Discover', 'es'), 'Explorar');
  assert.equal(translateText('App language', 'es'), 'Idioma de la aplicación');
  assert.equal(translateText('Send support request', 'es'), 'Enviar solicitud de soporte');
});

test('English stays unchanged and authored content falls back without alteration', () => {
  assert.equal(translateText('Discover', 'en'), 'Discover');
  assert.equal(translateText('Vintage denim jacket', 'es'), 'Vintage denim jacket');
  assert.equal(translateText('Vintage denim jacket', 'fr'), 'Vintage denim jacket');
});

test('profile language choices localize common navigation and live captions', () => {
  const languages = ['es', 'fr', 'pt', 'ar', 'hi', 'zh', 'sw', 'af', 'zu', 'xh', 'st', 'tn', 'nso'] as const;
  for (const language of languages) {
    assert.notEqual(translateText('Discover', language), 'Discover', `${language} navigation`);
    assert.notEqual(translateText('Turn captions on', language), 'Turn captions on', `${language} captions`);
  }
});
