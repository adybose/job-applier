// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanLabel } from './dom';
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
