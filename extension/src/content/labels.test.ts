// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { byIdInRoot, cleanLabel } from './dom';
import { resolveGroupLabel, resolveHelpText, resolveLabel } from './labels';

function dom(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

// AC-PP-1, one case per strategy in R-PP-4.
describe('resolveLabel', () => {
  it.each([
    ['label[for]', '<label for="a">First name *</label><input id="a">', '#a', 'First name'],
    ['wrapping label', '<label>Last name * <input id="a"></label>', '#a', 'Last name'],
    ['aria-labelledby', '<span id="l1">Email</span><span id="l2">address</span><input id="a" aria-labelledby="l1 l2">', '#a', 'Email address'],
    ['aria-label', '<input id="a" aria-label="Phone number">', '#a', 'Phone number'],
    ['fieldset legend', '<fieldset><legend>Work authorization</legend><input id="a"></fieldset>', '#a', 'Work authorization'],
    ['preceding text', '<div><p>City</p><input id="a"></div>', '#a', 'City'],
    ['placeholder', '<input id="a" placeholder="Portfolio URL">', '#a', 'Portfolio URL'],
    ['name', '<input id="a" name="github_url">', '#a', 'github_url'],
  ])('uses %s', (_strategy, html, selector, expected) => {
    const doc = dom(html);
    expect(resolveLabel(doc.querySelector(selector) as Element)).toBe(expected);
  });

  it('prefers label[for] over placeholder', () => {
    const doc = dom('<label for="a">Website</label><input id="a" placeholder="https://">');
    expect(resolveLabel(doc.querySelector('#a') as Element)).toBe('Website');
  });

  it('ignores option text and upload-button text inside a wrapping label (Lever)', () => {
    const doc = dom(`
      <label><div class="application-label">Resume/CV<span class="required">✱</span></div>
        <div class="application-field"><a><span>ATTACH RESUME/CV</span><input type="file" id="r"></a></div></label>
      <label><div>Gender</div><div><select id="g"><option>Male</option><option>Female</option></select></div></label>`);
    expect(resolveLabel(doc.querySelector('#r') as Element)).toBe('Resume/CV');
    expect(resolveLabel(doc.querySelector('#g') as Element)).toBe('Gender');
  });

  it('finds labels inside a shadow root', () => {
    const host = dom('<div id="host"></div>').querySelector('#host') as HTMLElement;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<label for="p">Preferred name</label><input id="p">';
    expect(resolveLabel(root.querySelector('#p') as Element)).toBe('Preferred name');
  });
});

describe('resolveGroupLabel', () => {
  it('uses the legend when the fieldset holds only this group', () => {
    const doc = dom(`<fieldset><legend>Gender</legend>
      <label><input type="radio" name="g" value="w"> Woman</label><label><input type="radio" name="g" value="m"> Man</label></fieldset>`);
    expect(resolveGroupLabel(Array.from(doc.querySelectorAll('input')))).toBe('Gender');
  });

  it('uses the question text before the options when the fieldset holds other fields', () => {
    const doc = dom(`<fieldset><legend>Diversity monitoring</legend><select><option>x</option></select>
      <p>Do you consider yourself to have a disability?</p>
      <label><input type="radio" name="d" value="y"> Yes</label><label><input type="radio" name="d" value="n"> No</label></fieldset>`);
    expect(resolveGroupLabel(Array.from(doc.querySelectorAll('input')))).toBe(
      'Do you consider yourself to have a disability?',
    );
  });

  it('finds the Lever question label above a list of options', () => {
    const doc = dom(`<li><div class="application-label"><div class="text">Open to travel?<span class="required">✱</span></div></div>
      <div class="application-field"><ul><li><label><input type="radio" name="t" value="Yes">Yes</label></li>
      <li><label><input type="radio" name="t" value="No">No</label></li></ul></div></li>`);
    expect(resolveGroupLabel(Array.from(doc.querySelectorAll('input')))).toBe('Open to travel?');
  });
});

// Recruitee (fixtures/captures/clanx-real.html): Radix ids, aria-hidden asterisks, nested fieldsets.
describe('Recruitee markup', () => {
  const asterisk = '<span aria-hidden="true"> <span title="This field is required and can not be left empty.">*</span></span>';

  it('reads label[for] when the id has ":" and "." in it', () => {
    const doc = dom(`<div><label for="input-candidate.name-radix-:R197l9r6l:">Full name${asterisk}</label>
      <input type="text" id="input-candidate.name-radix-:R197l9r6l:" name="candidate.name" placeholder="Full name" required></div>`);
    expect(resolveLabel(doc.querySelector('input') as Element)).toBe('Full name');
  });

  it('falls back to label[for] when aria-labelledby points at a missing id', () => {
    const doc = dom(`<section><label for="input-candidate.cv-radix-:R1nl9r6l:">CV or resume${asterisk}</label>
      <p id="cv-desc">Upload your CV or resume file</p>
      <div><div role="presentation"><input type="file" name="candidate.cv" id="input-candidate.cv-radix-:R1nl9r6l:"
        aria-labelledby="input-candidate.cv-radix-:R1pnl9r6lH2:" aria-describedby="cv-desc">
        <div aria-hidden="true"><span>Upload a file</span> or drag and drop here</div></div></div></section>`);
    expect(resolveLabel(doc.querySelector('input') as Element)).toBe('CV or resume');
  });

  it('uses the inner legend for a radio group inside the outer "Questions" fieldset', () => {
    const radio = (i: number, v: string) =>
      `<div><input required type="radio" id="q-radix-:R42:-${i}" name="candidate.openQuestionAnswers.7726117.flag" value="${v}">
        <label for="q-radix-:R42:-${i}"><span></span><span>${v === 'true' ? 'Yes' : 'No'}</span></label></div>`;
    const doc = dom(`<fieldset><legend>Questions</legend><p>Please fill in additional questions</p>
      <div><div><input type="hidden" name="candidate.openQuestionAnswers.7726117.openQuestionId" value="7726117">
        <div><fieldset><legend>Are you willing to relocate to Bengaluru?${asterisk}</legend>
          <div>${radio(0, 'true')}${radio(1, 'false')}</div></fieldset></div></div></div></fieldset>`);
    const radios = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type=radio]'));
    expect(resolveGroupLabel(radios)).toBe('Are you willing to relocate to Bengaluru?');
  });

  // The live page's aria-describedby lists end with a space ("…-error ") or the literal "undefined" (radios).
  it('reads help text when aria-describedby has a trailing space', () => {
    const doc = dom(`<label for="t">Why do you want to leave your current role?${asterisk}</label>
      <textarea id="t" name="candidate.openQuestionAnswers.7726131.content" aria-describedby="t-error "></textarea>
      <div role="alert" id="t-error"></div>`);
    expect(() => resolveHelpText(doc.querySelector('#t') as Element, 'Why do you want to leave your current role?')).not.toThrow();
  });

  it('reads help text when aria-describedby names an id that does not exist', () => {
    const doc = dom(`<input type="radio" id="r" name="q" value="Yes" aria-describedby="r-error undefined"><label for="r">Yes</label>
      <div role="alert" id="r-error"></div>`);
    expect(() => resolveHelpText(doc.querySelector('#r') as Element, 'Yes')).not.toThrow();
  });

  it('a label[for] lookup tolerates aria-labelledby with stray spaces', () => {
    const doc = dom(`<label for="cv">CV or resume</label><input type="file" id="cv" aria-labelledby=" missing-id ">`);
    expect(resolveLabel(doc.querySelector('#cv') as Element)).toBe('CV or resume');
  });
});

describe('byIdInRoot', () => {
  it('returns null for an empty id instead of throwing', () => {
    const doc = dom('<input id="a">');
    expect(() => byIdInRoot(doc.querySelector('#a') as Element, '')).not.toThrow();
    expect(byIdInRoot(doc.querySelector('#a') as Element, '')).toBeNull();
  });

  it('returns null for an empty id inside a shadow root', () => {
    const host = dom('<div id="host"></div>').querySelector('#host') as HTMLElement;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input id="b">';
    expect(byIdInRoot(root.querySelector('#b') as Element, '')).toBeNull();
  });
});

describe('helpers', () => {
  it('strips required markers and colons', () => {
    expect(cleanLabel('Email: *')).toBe('Email');
    expect(cleanLabel('Resume/CV ✱')).toBe('Resume/CV');
  });

  it('reads help text from aria-describedby', () => {
    const doc = dom('<label for="t">Project</label><p id="h">Two paragraphs is plenty.</p><textarea id="t" aria-describedby="h"></textarea>');
    expect(resolveHelpText(doc.querySelector('#t') as Element, 'Project')).toBe('Two paragraphs is plenty.');
  });
});
