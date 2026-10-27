import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// A scripted walkthrough of actual controls, not a participant timing study.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'test-results/task-difficulty');
const baseURL = 'http://127.0.0.1:4175';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root, windowsHide: true, stdio: 'ignore',
});
let browser;
const observations = [];

try {
  await mkdir(output, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw Error(`Observation server exited with ${server.exitCode}; port 4175 must be free.`);
    try { ready = (await fetch(baseURL)).ok; } catch { /* Wait for Vite to listen. */ }
    if (ready) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert(ready, 'Observation server did not start.');
  browser = await chromium.launch();

  async function observe(name, sequence, steps) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const page = await context.newPage();
      const instant = new Date('2026-10-27T12:00:00Z');
      await page.clock.install({ time: instant });
      await page.clock.pauseAt(instant);
      await page.goto(baseURL);
      await page.getByLabel('Participant ID').fill(`OBS_${name}`);
      await page.getByLabel('Sequence index').fill(String(sequence));
      await page.getByLabel('Supervisor access code').fill('observation-only');
      await page.getByRole('button', { name: 'Create session' }).click();
      await page.getByLabel('I consent to take part in this supervised pilot').check();
      await page.getByRole('button', { name: 'Continue to instructions' }).click();
      await page.getByRole('button', { name: 'Reveal first task' }).click();
      const operations = [];
      const submissions = [];
      const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')));
      const initial = await read();
      assert.equal(initial.trials[0].condition, 'baseline');
      const edit = async (description, action) => { await action(); operations.push(description); };
      const add = label => edit(`Add ${label}`, () => page.getByRole('button', { name: `Add ${label}`, exact: true }).click());
      const group = name => page.getByRole('group', { name, exact: true });
      const fill = (name, label, value) => edit(`${name}: ${label} = ${value}`, () => group(name).getByLabel(label).fill(value));
      const select = (name, label, value) => edit(`${name}: ${label} = ${value}`, () => group(name).getByLabel(label).selectOption(value));
      const lodging = value => edit(`Lodging = ${value}`, () => page.getByLabel('Saturday-night lodging').selectOption(value));
      const transport = value => edit(`Transport = ${value}`, () => page.getByLabel('Transport option').selectOption(value));
      const remove = name => edit(`Remove ${name}`, () => group(name).getByRole('button', { name: 'Remove', exact: true }).click());
      const submit = async expectedComplete => {
        await page.screenshot({ path: resolve(output, `${name}-attempt-${submissions.length + 1}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Complete task' }).click();
        await page.waitForFunction(count => JSON.parse(localStorage.getItem('planning-pilot-session-v1')).trials[0].submissionAttempts?.length === count, submissions.length + 1);
        const session = await read();
        const attempt = session.trials[0].submissionAttempts.at(-1);
        assert.equal(attempt.validation.isComplete, expectedComplete, `${name}: unexpected validation`);
        submissions.push({ afterEdits: operations.length, validation: attempt.validation });
      };
      await steps({ add, fill, select, lodging, transport, remove, submit });
      const session = await read();
      const trial = session.trials[0];
      assert.equal(trial.outcome, 'successful');
      assert.equal(trial.stateRevision, operations.length, 'Each reported edit must correspond to one committed revision.');
      assert.equal(session.events.filter(event => event.eventType === 'agent_intervention_shown').length, 0);
      observations.push({
        name, task: trial.task, condition: trial.condition, configuration: session.configuration,
        edits: operations.length, operations, submissions, finalPlan: trial.finalPlan,
        finalValidation: trial.finalValidation,
      });
    } finally { await context.close(); }
  }

  await observe('birthday-minimum', 1, async ({ add, submit }) => {
    for (const option of ['Wrap buffet', 'Water pack', 'Trivia', 'Banners']) await add(option);
    await submit(true);
  });
  await observe('birthday-corrections', 1, async ({ add, fill, remove, submit }) => {
    for (const option of ['Wrap buffet', 'Water pack', 'Craft workshop']) await add(option);
    await submit(false);
    await add('Banners');
    await submit(false);
    await remove('Wrap buffet item 1');
    await add('Sandwich platter');
    await fill('Sandwich platter item 4', 'Quantity', '2');
    await submit(true);
  });
  await observe('birthday-coverage', 1, async ({ add, fill, submit }) => {
    for (const option of ['Sandwich platter', 'Water pack', 'Party games', 'Banners']) await add(option);
    await submit(false);
    await fill('Sandwich platter item 1', 'Quantity', '2');
    await submit(true);
  });
  await observe('weekend-repeated-activity', 13, async ({ add, fill, select, lodging, transport, submit }) => {
    await lodging('guesthouse'); await transport('transit-pass');
    for (let index = 0; index < 4; index++) await add('Park walk');
    await fill('Park walk booking 2', 'Start time', '11:00');
    await select('Park walk booking 3', 'Day', '1');
    await select('Park walk booking 4', 'Day', '1');
    await fill('Park walk booking 4', 'Start time', '11:00');
    await submit(true);
  });
  await observe('weekend-diverse', 13, async ({ add, fill, select, lodging, transport, submit }) => {
    await lodging('guesthouse'); await transport('transit-pass');
    for (const option of ['Museum visit', 'Gallery visit', 'Park walk', 'Harbor tour']) await add(option);
    await fill('Gallery visit booking 2', 'Start time', '12:00');
    await select('Park walk booking 3', 'Day', '1');
    await fill('Park walk booking 3', 'Start time', '09:00');
    await select('Harbor tour booking 4', 'Day', '1');
    await fill('Harbor tour booking 4', 'Start time', '11:00');
    await submit(true);
  });
  await observe('weekend-corrections', 13, async ({ add, fill, select, lodging, transport, submit }) => {
    await lodging('luxury-suite'); await transport('transit-pass');
    for (const option of ['Museum visit', 'Gallery visit', 'Park walk', 'Harbor tour']) await add(option);
    await fill('Museum visit booking 1', 'Start time', '09:30');
    await fill('Gallery visit booking 2', 'Start time', '11:00');
    await select('Park walk booking 3', 'Day', '1');
    await fill('Park walk booking 3', 'Start time', '09:00');
    await select('Harbor tour booking 4', 'Day', '1');
    await submit(false);
    await lodging('guesthouse');
    await fill('Museum visit booking 1', 'Start time', '10:00');
    await fill('Gallery visit booking 2', 'Start time', '11:30');
    await fill('Harbor tour booking 4', 'Start time', '10:45');
    await submit(true);
  });
  await observe('schedule-minimum', 25, async ({ add, fill, submit }) => {
    await add('preparation block');
    await fill('preparation block 1', 'Duration (minutes)', '240');
    await submit(true);
  });
  await observe('schedule-split', 25, async ({ add, select, submit }) => {
    await add('preparation block');
    for (const day of [1, 2, 3]) {
      await add('preparation block');
      await select(`preparation block ${day + 1}`, 'Day', String(day));
    }
    await submit(true);
  });
  await observe('schedule-corrections', 25, async ({ add, fill, select, submit }) => {
    await add('preparation block');
    await fill('preparation block 1', 'Start time', '10:00');
    await fill('preparation block 1', 'Duration (minutes)', '240');
    await submit(false);
    await select('preparation block 1', 'Day', '4');
    await fill('preparation block 1', 'Start time', '14:00');
    await submit(false);
    await fill('preparation block 1', 'Start time', '13:00');
    await submit(true);
  });

  const page = await browser.newPage();
  await page.goto(baseURL);
  const search = await page.evaluate(async () => {
    const { birthdayTask, BIRTHDAY_CATALOG } = await import('/src/tasks/birthday.ts');
    const { scheduleTask, FIXED_COMMITMENTS } = await import('/src/tasks/schedule.ts');
    const combinations = [];
    for (const food of BIRTHDAY_CATALOG.filter(option => option.category === 'food')) {
      for (const drink of BIRTHDAY_CATALOG.filter(option => option.category === 'drink')) {
        for (const activity of BIRTHDAY_CATALOG.filter(option => option.category === 'activity')) {
          const state = { items: [
            { id: 'food', optionId: food.id, quantity: Math.ceil(12 / food.servings) },
            { id: 'drink', optionId: drink.id, quantity: Math.ceil(12 / drink.servings) },
            { id: 'activity', optionId: activity.id, quantity: 1, startMinute: 840 },
            { id: 'decoration', optionId: 'banners', quantity: 1 },
          ] };
          combinations.push({ food: food.label, drink: drink.label, activity: activity.label,
            cost: birthdayTask.getAgentContext(state).summary.totalCost, validation: birthdayTask.validate(state) });
        }
      }
    }
    const preparationSlots = [];
    for (let day = 0; day < 5; day++) {
      for (let startMinute = 480; startMinute + 240 <= 1200; startMinute += 15) {
        const validation = scheduleTask.validate({ blocks: [...FIXED_COMMITMENTS,
          { id: 'preparation', kind: 'preparation', day, startMinute, durationMinutes: 240 }] });
        if (validation.isComplete) preparationSlots.push({ day, startMinute });
      }
    }
    return { birthdayMinimumQuantityCombinations: combinations, schedulePassingFourHourStartsOn15MinuteGrid: preparationSlots };
  });
  const result = { method: 'Scripted baseline browser walkthrough; clock paused, no human timing inference. Edit counts exclude setup and submission. Enumeration sets are different and their pass rates must not be compared as task-difficulty probabilities.', observations, search };
  await writeFile(resolve(output, 'observations.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ traces: observations.map(({ name, edits, submissions }) => ({ name, edits, failedSubmissions: submissions.filter(attempt => !attempt.validation.isComplete).length })), birthdayPassingCombinations: search.birthdayMinimumQuantityCombinations.filter(option => option.validation.isComplete).length, birthdayTotalCombinations: search.birthdayMinimumQuantityCombinations.length, schedulePassingFourHourStarts: search.schedulePassingFourHourStartsOn15MinuteGrid.length, evidence: resolve(output, 'observations.json') }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
