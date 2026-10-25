import { expect, test } from 'bun:test';
import { refreshDocuments } from '../src/lib/refreshDocuments';

function fake(result: any, error: any = null) {
  const writes: any[] = [];
  const filters: any[] = [];
  const calls: any[] = [];
  const chain = (data: any) => ({ eq: (key: string, value: string) => {
    filters.push([key, value]);
    return chain(data);
  }, select: () => chain(data), single: async () => ({ data, error: null }) });
  const client = {
    from: () => ({ select: () => chain({ job: { id: 'job', title: 'Engineer', company: 'Employer', description: 'Current posting', requirements: ['Python'] } }),
      update: (values: any) => { writes.push(values); return chain({ id: 'application', ...values }); } }),
    functions: { invoke: async (name: string, args: any) => { calls.push([name, args]); return { data: result, error }; } },
  };
  return { client, writes, filters, calls };
}

test('refresh generates both documents without submitting a stale profile and saves only to the caller', async () => {
  const f = fake({ tailoredResume: 'Latest CV', tailoredCoverLetter: 'Latest letter' });
  const updated = await refreshDocuments(f.client, 'application', 'caller');
  expect(f.calls[0][1].body.userProfile).toBeUndefined();
  expect(f.calls[0][1].body.description).toBe('Current posting');
  expect(f.writes).toEqual([{ tailored_resume: 'Latest CV', tailored_cover_letter: 'Latest letter' }]);
  expect(f.filters.filter(([key]) => key === 'user_id')).toEqual([['user_id', 'caller'], ['user_id', 'caller']]);
  expect(updated.tailored_resume).toBe('Latest CV');
});

test('failed or incomplete generation preserves both saved documents', async () => {
  for (const [result, error] of [[null, { message: 'Timeout' }], [{ tailoredResume: 'Only CV' }, null], [{ error: 'No profile' }, null]]) {
    const f = fake(result, error);
    await expect(refreshDocuments(f.client, 'application', 'caller')).rejects.toThrow();
    expect(f.writes).toEqual([]);
  }
});