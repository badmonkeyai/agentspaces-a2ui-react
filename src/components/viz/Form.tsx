/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Form: a form from a schema fragment of the data catalog: the fields given, or those the data model carries
// under /fragments/<iri>/fields ({name, type, required}); values live in the data model under /form/<id>, the submit
// action carries them with the fragment's IRI.
import { define, useData } from '../../renderer/implementation';
import type { FormProps } from '../../generated/props';

type Field = { name: string; type?: string; required?: boolean; label?: string };

export const Form = define<FormProps>('Form', ({ props, ctx }) => {
  const fragment = String(props.fragment ?? '');
  const declared = useData<Field[]>(ctx, `/fragments/${fragment.replace(/~/g, '~0').replace(/\//g, '~1')}/fields`);
  const fields: Field[] = props.fields?.length ? props.fields.map(f => ({ name: f })) : Array.isArray(declared) ? declared : [];
  const values = useData<Record<string, unknown>>(ctx, `/form/${props.id}`) ?? {};
  const label = (f: Field) => f.label ?? f.name;
  const submit = (e: { preventDefault(): void }) => { e.preventDefault(); ctx.dispatch(props.submitAction, { fragment, values }); };
  if (!fields.length) return <div className="bma-empty" data-component="Form">The fragment {fragment.split(/[#/]/).pop()} names no field yet.</div>;
  return (
    <form className="bma-form" data-component="Form" onSubmit={submit}>
      <div className="bma-muted bma-small">{fragment.split(/[#/]/).pop()}</div>
      {fields.map(f => <label key={f.name}><span>{label(f)}{f.required ? ' *' : ''}</span>
        <input name={f.name} type={f.type === 'number' || f.type === 'integer' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={!!f.required} value={values[f.name] === undefined ? '' : String(values[f.name])}
          onChange={e => ctx.set(`/form/${props.id}/${f.name}`, f.type === 'number' || f.type === 'integer' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} /></label>)}
      <div><button type="submit" className="bma-btn primary">{props.submitAction}</button></div>
    </form>
  );
});
