/**
 * OGCupid - Classic 2011 10-Essay Component
 * Self-contained module for rendering both preview and editor modes
 * Uses native classic.css classes (.og-preview-essay, .profile-field)
 */

export const CLASSIC_ESSAYS = Object.freeze([
  {
    key: 'aboutMe',
    previewId: 'about',
    title: 'My self-summary',
    placeholder: 'Give people a sense of who you are.',
    max: 5000,
    rows: 7
  },
  {
    key: 'lifeDirection',
    previewId: 'life-direction',
    title: "What I'm doing with my life",
    placeholder: "Projects, dreams, detours, things you're figuring out.",
    max: 2000,
    rows: 4
  },
  {
    key: 'goodAt',
    previewId: 'good-at',
    title: "I'm really good at",
    placeholder: 'Big or small. Brag a little.',
    max: 1500,
    rows: 4
  },
  {
    key: 'firstThings',
    previewId: 'first-things',
    title: 'The first things people usually notice about me',
    placeholder: 'Physical traits, voice, laugh, posture...',
    max: 1500,
    rows: 4
  },
  {
    key: 'favorites',
    previewId: 'favorites',
    title: 'Favorite books, movies, music, and food',
    placeholder: 'Tell people what you keep coming back to.',
    max: 2000,
    rows: 4
  },
  {
    key: 'sixThings',
    previewId: 'six-things',
    title: 'The six things I could never do without',
    placeholder: 'Six things, or six paragraphs. Your call.',
    max: 1500,
    rows: 4
  },
  {
    key: 'thinkingAbout',
    previewId: 'thinking-about',
    title: 'I spend a lot of time thinking about',
    placeholder: 'Ideas, obsessions, trivial mysteries...',
    max: 1500,
    rows: 4
  },
  {
    key: 'fridayNight',
    previewId: 'friday-night',
    title: 'On a typical Friday night I am…',
    placeholder: 'Be as unglamorous or interesting as you like.',
    max: 1500,
    rows: 4
  },
  {
    key: 'privateThing',
    previewId: 'private-thing',
    title: "The most private thing I'm willing to admit",
    placeholder: "What would you tell someone who really wanted to know you?",
    max: 1500,
    rows: 4
  },
  {
    key: 'messageMeIf',
    previewId: 'message-me-if',
    title: 'You should message me if…',
    placeholder: 'Give someone a reason to say more than hey.',
    max: 1500,
    rows: 4
  }
]);

/**
 * Escapes unsafe characters for safe DOM insertion
 */
export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats multi-line essay text into clean paragraphs
 */
export function formatEssayParagraphs(text) {
  if (!text || !text.trim()) {
    return '<p class="empty-essay-note"><em>(Not answered yet)</em></p>';
  }
  return text
    .split('\n')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(para => `<p>${escapeHtml(para)}</p>`)
    .join('');
}

/**
 * Renders the 10-essay preview container (Profile Display mode)
 * Matches .og-preview-essay structure from classic.css
 */
export function renderEssaysPreview(profileData = {}, options = {}) {
  const { showEmpty = false, isOwner = false } = options;

  return CLASSIC_ESSAYS.map(essay => {
    const rawValue = profileData[essay.key] || '';
    const hasValue = Boolean(rawValue && rawValue.trim());

    if (!hasValue && !showEmpty && !isOwner) {
      return '';
    }

    const bodyContent = formatEssayParagraphs(rawValue);
    const editButton = isOwner
      ? `<a href="#profile-${essay.key}" class="essay-inline-edit" data-edit-key="${essay.key}">Edit</a>`
      : '';

    return `
      <section class="og-preview-essay" id="preview-${essay.previewId}-section" data-essay-key="${essay.key}">
        <div class="og-preview-essay-header">
          <h4>${escapeHtml(essay.title)}</h4>
          ${editButton}
        </div>
        <div id="preview-${essay.previewId}" class="og-preview-essay-body">
          ${bodyContent}
        </div>
      </section>
    `;
  }).join('');
}

/**
 * Renders the 10-essay form inputs (Profile Editor mode)
 * Matches .profile-field-grid structure from classic.css
 */
export function renderEssaysEditor(profileData = {}) {
  return CLASSIC_ESSAYS.map(essay => {
    const value = profileData[essay.key] || '';
    const length = value.length;

    return `
      <div class="profile-field profile-field-wide" data-field-group="${essay.key}">
        <label for="profile-${essay.key}">${escapeHtml(essay.title)}</label>
        <textarea 
          id="profile-${essay.key}" 
          name="${essay.key}" 
          rows="${essay.rows}" 
          maxlength="${essay.max}" 
          placeholder="${escapeHtml(essay.placeholder)}">${escapeHtml(value)}</textarea>
        <span class="hint"><span id="${essay.key}-count">${length}</span> / ${essay.max} characters</span>
      </div>
    `;
  }).join('');
}

/**
 * Binds live character counter events to textareas
 */
export function attachEssayCounters(container) {
  if (!container) return;
  CLASSIC_ESSAYS.forEach(essay => {
    const textarea = container.querySelector(`#profile-${essay.key}`);
    const counter = container.querySelector(`#${essay.key}-count`);
    if (textarea && counter) {
      textarea.addEventListener('input', () => {
        counter.textContent = textarea.value.length;
      });
    }
  });
}
