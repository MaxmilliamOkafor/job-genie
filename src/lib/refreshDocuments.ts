export async function refreshDocuments(client: any, applicationId: string, userId: string) {
  const { data: application, error: readError } = await client.from('applications')
    .select('id, job:jobs(id, title, company, location, description, requirements, url)')
    .eq('id', applicationId).eq('user_id', userId).single();
  if (readError || !application?.job) throw new Error('The saved job could not be loaded. Your documents were not changed.');
  const job = application.job;
  const { data, error } = await client.functions.invoke('tailor-application', {
    body: { jobId: job.id, jobTitle: job.title, company: job.company, location: job.location,
      description: job.description || '', requirements: job.requirements || [], jobUrl: job.url },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Your documents could not be refreshed.');
  if (!data?.tailoredResume?.trim() || !data?.tailoredCoverLetter?.trim()) {
    throw new Error('Both documents must finish before replacing your saved copies. Nothing was changed.');
  }
  const { data: updated, error: saveError } = await client.from('applications')
    .update({ tailored_resume: data.tailoredResume, tailored_cover_letter: data.tailoredCoverLetter })
    .eq('id', applicationId).eq('user_id', userId).select().single();
  if (saveError || !updated) throw new Error('Your refreshed documents could not be saved. Please try again.');
  return updated;
}