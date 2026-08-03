'use strict';
// Guion + escenas del welcome BPC (datos puros, sin lógica de render).
// Lo consume tools/make-welcome-video.js. Narración en inglés, corta.
//
// kind:  'title' | 'content' | 'outro'
// narration: lo que dice la voz IA (Gemini TTS). 1-2 frases.
// eyebrow/title/subtitle/bullets: lo que se VE en pantalla (branded).

const SCENES = [
  {
    id: 'intro',
    kind: 'title',
    eyebrow: 'Bryant Park Consulting · Internal Preview',
    title: 'The NSPB\nAssistant',
    subtitle: 'Natural-language access to NetSuite Planning & Budgeting.',
    narration:
      'Welcome to the B P C NSPB Assistant — the fastest way to work with NetSuite Planning and Budgeting.',
  },
  {
    id: 'problem',
    kind: 'content',
    eyebrow: 'The problem',
    title: 'Planning is\npowerful, but slow',
    subtitle: 'Why teams lose hours every week',
    bullets: [
      'Querying Oracle Planning means navigating Hyperion and Essbase by hand',
      'Forms, rules and variables are buried deep in the console',
      'Technical, slow, and easy to get wrong',
    ],
    narration:
      "Querying Oracle's Planning and Budgeting cubes usually means navigating Hyperion and Essbase by hand. It is slow, technical, and easy to get wrong.",
  },
  {
    id: 'excel',
    kind: 'content',
    eyebrow: 'Excel add-in',
    title: 'Just ask,\nin plain English',
    subtitle: 'Inside the task pane',
    bullets: [
      'Type a question — no menus, no Essbase syntax',
      'The assistant runs the NSPB query for you',
      'A clean, formatted grid lands right in your sheet',
    ],
    narration:
      'With our Excel add-in, you just ask in plain English. The assistant runs the query and writes a clean, formatted grid right into your sheet.',
  },
  {
    id: 'console',
    kind: 'content',
    eyebrow: 'Web console copilot',
    title: 'It drives the\nreal console',
    subtitle: 'A side panel that does the clicking',
    bullets: [
      'Open forms, rules, variables and jobs from chat',
      'It navigates the real Planning console for you',
      'And explains what every part does',
    ],
    narration:
      'Our web console copilot goes further — a side panel that drives the real Planning console for you. Open forms, rules, variables and jobs, with an explanation of every step.',
  },
  {
    id: 'deliverables',
    kind: 'content',
    eyebrow: 'Deliverables',
    title: 'From insight\nto delivery',
    subtitle: 'Sellable, branded outputs',
    bullets: [
      'Current-state assessments',
      'Cube-optimization performance reviews',
      'The BPC Customer Hub — clients track everything',
    ],
    narration:
      'It also powers our deliverables — current-state assessments, cube optimization reviews, and the B P C Customer Hub, where clients track everything.',
  },
  {
    id: 'outro',
    kind: 'outro',
    eyebrow: 'Internal Preview',
    title: 'Let’s build the\nfuture of planning',
    subtitle: 'Bryant Park Consulting · NetSuite Planning & Budgeting',
    narration:
      "That's the B P C NSPB Assistant. This is an internal preview — let's build the future of planning, together.",
  },
];

module.exports = { SCENES };
