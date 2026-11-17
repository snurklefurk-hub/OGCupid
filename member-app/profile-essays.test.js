import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_ESSAYS,
  escapeHtml,
  formatEssayParagraphs,
  renderEssaysPreview,
  renderEssaysEditor
} from './profile-essays.js';

test('CLASSIC_ESSAYS contains all 9 classic prompts', () => {
  assert.equal(CLASSIC_ESSAYS.length, 9);
  const expectedKeys = [
    'aboutMe',
    'lifeDirection',
    'goodAt',
    'firstThings',
    'favorites',
    'sixThings',
    'thinkingAbout',
    'fridayNight',
    'messageMeIf'
  ];
  assert.deepEqual(CLASSIC_ESSAYS.map(e => e.key), expectedKeys);
});

test('escapeHtml sanitizes script tags and special chars', () => {
  const unsafe = '<script>alert("hack")</script>&foo';
  const safe = escapeHtml(unsafe);
  assert.equal(safe.includes('<script>'), false);
  assert.equal(safe.includes('&amp;'), true);
  assert.equal(safe.includes('&lt;script&gt;'), true);
});

test('formatEssayParagraphs splits paragraphs and handles empty state', () => {
  assert.match(formatEssayParagraphs(''), /empty-essay-note/);
  assert.match(formatEssayParagraphs('   '), /empty-essay-note/);

  const formatted = formatEssayParagraphs('First paragraph\n\nSecond paragraph');
  assert.match(formatted, /<p>First paragraph<\/p><p>Second paragraph<\/p>/);
});

test('renderEssaysPreview renders populated essays and omits empty for visitors', () => {
  const profile = {
    aboutMe: 'A fun summary',
    goodAt: 'Coding retro apps'
  };

  const visitorHtml = renderEssaysPreview(profile, { isOwner: false });
  assert.match(visitorHtml, /preview-about-section/);
  assert.match(visitorHtml, /A fun summary/);
  assert.match(visitorHtml, /Coding retro apps/);
  // Empty essays should not render for visitor
  assert.equal(visitorHtml.includes('preview-six-things-section'), false);

  const ownerHtml = renderEssaysPreview(profile, { isOwner: true, showEmpty: true });
  // All 9 sections appear for owner
  assert.match(ownerHtml, /preview-six-things-section/);
  assert.match(ownerHtml, /essay-inline-edit/);
});

test('renderEssaysEditor generates all 9 textareas with counters', () => {
  const profile = { aboutMe: 'Existing bio' };
  const editorHtml = renderEssaysEditor(profile);

  for (const essay of CLASSIC_ESSAYS) {
    assert.match(editorHtml, new RegExp(`id="profile-${essay.key}"`));
    assert.match(editorHtml, new RegExp(`name="${essay.key}"`));
  }
  assert.match(editorHtml, /Existing bio/);
  assert.match(editorHtml, /<span id="aboutMe-count">12<\/span>/);
});
