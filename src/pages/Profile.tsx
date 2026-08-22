import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { CVUpload } from '@/components/profile/CVUpload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiUsageChart } from '@/components/profile/ApiUsageChart';
import { WorkExperiencePreview } from '@/components/profile/WorkExperiencePreview';
import { RelevantProjectsPreview } from '@/components/profile/RelevantProjectsPreview';
import { CVPreviewModal } from '@/components/profile/CVPreviewModal';
import { ProfileVersionHistory, createExportWithHistory } from '@/components/profile/ProfileVersionHistory';
import { DataPreviewPanel } from '@/components/profile/DataPreviewPanel';
import {
  User, Briefcase, GraduationCap, Award, Download, Save, Plus, X,
  Shield, CheckCircle, Globe, FileText, Languages, Key,
  Loader2, Activity, Zap, AlertTriangle, Upload, FolderDown, FolderGit2, GripVertical
} from 'lucide-react';
import { toast } from 'sonner';

import { normalizeWorkExperience, formatDateRange, extractDatesFromTitle } from '@/lib/workExperienceNormalization';
import {
  EMPLOYMENT_TYPES,
  COMPETENCY_CATEGORY,
  normaliseProfileForSave,
  validateProfileForSave,
  normaliseCompany,
  normaliseLocation,
  validateLocation,
  splitTitleAndEmploymentType,
  splitSkillLists,
  crossListDuplicates,
  combinedSkillsPreview,
  groupedSkillsPreview,
  UNGROUPED_LABEL,
  validateSkills,
  projectIssues,
  validateEducationEntry,
  PROJECT_DESCRIPTION_MAX,
  CERTIFICATIONS_MAX,
  CERTIFICATIONS_CAP_MESSAGE,
  includedCertifications,
  printedCertifications,
  certificationsBelowLine,
} from '@/lib/profileValidation';



// Default ATS answers that pass knockout questions
const DEFAULT_ATS_ANSWERS = {
  willing_to_relocate: true,
  visa_required: false,
  veteran_status: false,
  disability: false,
  security_clearance: true,
  driving_license: true,
  over18: true,
  legalToWork: true,
  backgroundCheckConsent: true,
  drugTestConsent: true,
  nonCompeteAgreement: false,
  immediateStart: true,
  flexibleSchedule: true,
  travelWillingness: true,
  remoteWorkCapable: true,
};

const Profile = () => {
  const { user } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const [editMode, setEditMode] = useState(false);
  const [localProfile, setLocalProfile] = useState<Partial<Profile>>({});
  const [draggedCertification, setDraggedCertification] = useState<number | null>(null);
  const [newSkill, setNewSkill] = useState({ name: '', years: 7, category: 'technical' as const });
  // API key is always hidden for security - no toggle
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [isTestingKimiKey, setIsTestingKimiKey] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Export profile to JSON file with version history
  const handleExportProfile = () => {
    if (!localProfile) {
      toast.error('No profile data to export');
      return;
    }
    
    setIsExporting(true);
    try {
      // Create profile data (exclude sensitive fields like API keys)
      const profileData = {
        first_name: localProfile.first_name,
        last_name: localProfile.last_name,
        email: localProfile.email,
        phone: localProfile.phone,
        address: localProfile.address,
        city: localProfile.city,
        state: localProfile.state,
        zip_code: localProfile.zip_code,
        country: localProfile.country,
        citizenship: localProfile.citizenship,
        linkedin: localProfile.linkedin,
        github: localProfile.github,
        portfolio: localProfile.portfolio,
        current_salary: localProfile.current_salary,
        expected_salary: localProfile.expected_salary,
        notice_period: localProfile.notice_period,
        total_experience: localProfile.total_experience,
        highest_education: localProfile.highest_education,
        willing_to_relocate: localProfile.willing_to_relocate,
        driving_license: localProfile.driving_license,
        visa_required: localProfile.visa_required,
        veteran_status: localProfile.veteran_status,
        disability: localProfile.disability,
        security_clearance: localProfile.security_clearance,
        hispanic_latino: localProfile.hispanic_latino,
        race_ethnicity: localProfile.race_ethnicity,
        gender: localProfile.gender,
        authorized_countries: localProfile.authorized_countries,
        skills: localProfile.skills,
        certifications: localProfile.certifications,
        professional_experience: localProfile.professional_experience,
        relevant_projects: localProfile.relevant_projects,
        education: localProfile.education,
        languages: localProfile.languages,
        cover_letter: localProfile.cover_letter,
        ats_strategy: localProfile.ats_strategy,
        excluded_companies: localProfile.excluded_companies,
      };
      
      // Create export with version history tracking
      const exportData = createExportWithHistory(profileData);
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantumhire-profile-${localProfile.first_name || 'user'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Profile exported! Changes: ${exportData.changesSummary?.join(', ') || 'Initial export'}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export profile');
    } finally {
      setIsExporting(false);
    }
  };

  // Restore profile from version history
  const handleRestoreFromHistory = async (profileData: Record<string, any>) => {
    // Normalize work experience if present
    if (profileData.work_experience) {
      profileData.work_experience = normalizeWorkExperience(profileData.work_experience);
    }
    
    // Update local state
    setLocalProfile(prev => ({ ...prev, ...profileData }));
    
    // Save to database
    await updateProfile(profileData);
  };

  // Import profile from JSON file
  const handleImportProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      toast.error('Please select a JSON file');
      return;
    }
    
    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importData = JSON.parse(content);
        
        // Validate the import data structure
        if (!importData.profile) {
          throw new Error('Invalid profile export file');
        }
        
        const profileData = importData.profile;
        
        // Normalize work experience if present
        if (profileData.work_experience) {
          profileData.work_experience = normalizeWorkExperience(profileData.work_experience);
        }
        
        // Update local state
        setLocalProfile(prev => ({ ...prev, ...profileData }));
        
        // Save to database
        await updateProfile(profileData);
        
        toast.success(`Profile imported successfully! (exported ${new Date(importData.exportedAt).toLocaleDateString()})`);
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import profile. Please check the file format.');
      } finally {
        setIsImporting(false);
        // Reset the input
        event.target.value = '';
      }
    };
    
    reader.onerror = () => {
      toast.error('Failed to read file');
      setIsImporting(false);
    };
    
    reader.readAsText(file);
  };

  // Note: API usage stats are now shown in the ApiUsageChart component

  const testApiKey = async () => {
    if (!localProfile.openai_api_key) {
      toast.error('Please enter an API key first');
      return;
    }
    
    setIsTestingKey(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-openai-key', {
        body: { apiKey: localProfile.openai_api_key }
      });
      
      if (error) throw error;
      
      if (data.valid) {
        toast.success(data.message);
        if (!data.hasGpt4oMini) {
          toast.warning('Note: GPT-4o-mini may not be available on your account');
        }
      } else {
        toast.error(data.error || 'Invalid API key');
      }
    } catch (error: any) {
      console.error('API key test error:', error);
      toast.error(error.message || 'Failed to validate API key');
    } finally {
      setIsTestingKey(false);
    }
  };

  const testKimiApiKey = async () => {
    if (!localProfile.kimi_api_key) {
      toast.error('Please enter a Kimi API key first');
      return;
    }
    
    setIsTestingKimiKey(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-kimi-key', {
        body: { apiKey: localProfile.kimi_api_key }
      });
      
      if (error) throw error;
      
      if (data.valid) {
        toast.success(data.message);
        if (data.availableModels?.length > 0) {
          console.log('Available Kimi models:', data.availableModels);
        }
      } else {
        toast.error(data.error || 'Invalid API key');
      }
    } catch (error: any) {
      console.error('Kimi API key test error:', error);
      toast.error(error.message || 'Failed to validate API key');
    } finally {
      setIsTestingKimiKey(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setLocalProfile(profile);
    }
  }, [profile]);


  const handleSave = async () => {
    const normalized = normaliseProfileForSave({
      ...localProfile,
      professional_experience: normalizeWorkExperience(localProfile.professional_experience || []),
    });

    const warnings = validateProfileForSave(normalized);

    const below = certificationsBelowLine(
      normalized.certifications || [],
      (normalized as any).certifications_excluded || [],
    );
    if (below.length) {
      warnings.unshift(
        `Only the first ${CERTIFICATIONS_MAX} certifications in your order will print. Below the line: ${below.join(', ')}.`,
      );
    }

    setLocalProfile(normalized);
    await updateProfile(normalized);
    setEditMode(false);

    if (warnings.length) {
      toast.warning(warnings[0], {
        description:
          warnings.length > 1
            ? `Saved anyway. ${warnings.length - 1} more thing(s) worth tidying.`
            : 'Saved anyway.',
      });
    }
  };

  const updateLocalField = (field: keyof Profile, value: any) => {
    setLocalProfile(prev => ({ ...prev, [field]: value }));
  };

  const addSkill = () => {
    if (!newSkill.name.trim()) return;
    const skills = [...(localProfile.skills || []), newSkill];
    updateLocalField('skills', skills);
    setNewSkill({ name: '', years: 7, category: 'technical' });
  };

  const removeSkill = (index: number) => {
    const skills = [...(localProfile.skills || [])];
    skills.splice(index, 1);
    updateLocalField('skills', skills);
  };

  const certExcluded: string[] = ((localProfile as any).certifications_excluded || []) as string[];

  const certIsIncluded = (cert: string) =>
    !certExcluded.some((c) => c.toLowerCase() === String(cert).toLowerCase());

  const toggleCertificationIncluded = (cert: string) => {
    const next = certIsIncluded(cert)
      ? [...certExcluded, cert]
      : certExcluded.filter((c) => c.toLowerCase() !== String(cert).toLowerCase());
    updateLocalField('certifications_excluded' as any, next);
  };

  const addCertification = (cert: string) => {
    if (!cert.trim()) return;
    const existing = [...(localProfile.certifications || [])];
    updateLocalField('certifications', [...existing, cert]);
    if (includedCertifications([...existing, cert], certExcluded).length > CERTIFICATIONS_MAX) {
      toast.warning(CERTIFICATIONS_CAP_MESSAGE, {
        description: `Only the top ${CERTIFICATIONS_MAX} included certifications print on your CV.`,
      });
    }
  };

  const moveCertification = (index: number, target: number) => {
    const certs = [...(localProfile.certifications || [])];
    if (target < 0 || target >= certs.length) return;
    const [moved] = certs.splice(index, 1);
    certs.splice(target, 0, moved);
    updateLocalField('certifications', certs);
  };

  const removeCertification = (index: number) => {
    const certs = [...(localProfile.certifications || [])];
    certs.splice(index, 1);
    updateLocalField('certifications', certs);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  // Check if there's an active AI provider configured correctly
  const hasActiveProvider = (
    // Kimi is preferred and configured
    (localProfile.preferred_ai_provider === 'kimi' && localProfile.kimi_enabled && !!localProfile.kimi_api_key) ||
    // OpenAI is preferred and configured
    (localProfile.preferred_ai_provider === 'openai' && localProfile.openai_enabled && !!localProfile.openai_api_key) ||
    // Kimi is enabled as fallback
    (localProfile.kimi_enabled && !!localProfile.kimi_api_key) ||
    // OpenAI is enabled as fallback
    (localProfile.openai_enabled && !!localProfile.openai_api_key)
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Warning Banner for Missing API Key */}
        {!hasActiveProvider && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                <strong>No active AI provider configured.</strong> Add an API key and enable a provider below to use AI features.
              </span>
              <a href="#api-key-section" className="underline font-medium ml-2">
                Configure AI below
              </a>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Profile</h1>
            <p className="text-muted-foreground mt-1">Your CV data for auto-applications</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Export/Import buttons */}
            <Button 
              onClick={handleExportProfile} 
              variant="outline" 
              size="sm"
              disabled={isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderDown className="h-4 w-4" />
              )}
              Export
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImportProfile}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isImporting}
              />
              <Button 
                variant="outline" 
                size="sm"
                disabled={isImporting}
                className="gap-2 pointer-events-none"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Import
              </Button>
            </div>
            
            {editMode ? (
              <Button onClick={handleSave} size="sm" className="gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            ) : (
              <Button onClick={() => setEditMode(true)} variant="secondary" size="sm">
                Edit Profile
              </Button>
            )}
          </div>
        </div>

        {/* CV Upload */}
        <CVUpload
          cvFileName={localProfile.cv_file_name}
          cvFilePath={localProfile.cv_file_path}
          cvUploadedAt={localProfile.cv_uploaded_at}
          onUploadComplete={(path, fileName) => {
            updateLocalField('cv_file_path', path);
            updateLocalField('cv_file_name', fileName);
            updateLocalField('cv_uploaded_at', new Date().toISOString());
            // Auto-save when CV is uploaded
            updateProfile({
              cv_file_path: path,
              cv_file_name: fileName,
              cv_uploaded_at: new Date().toISOString(),
            });
          }}
          onDelete={() => {
            updateLocalField('cv_file_path', null);
            updateLocalField('cv_file_name', null);
            updateLocalField('cv_uploaded_at', null);
            updateProfile({
              cv_file_path: null,
              cv_file_name: null,
              cv_uploaded_at: null,
            });
          }}
          onParsedData={(parsedData, mode) => {
            if (mode === 'work_experience_only') {
              // ONLY update professional_experience from parsed CV - preserve other fields
              if (parsedData.work_experience && parsedData.work_experience.length > 0) {
                const normalizedExp = normalizeWorkExperience(parsedData.work_experience as any);
                setLocalProfile(prev => ({ ...prev, professional_experience: normalizedExp }));
                updateProfile({ professional_experience: normalizedExp } as any);
              } else {
                toast.warning('No work experience found in CV');
              }
            } else {
              // Import ALL fields from parsed CV
              const updates: Partial<typeof localProfile> = {};

              if (parsedData.first_name) updates.first_name = parsedData.first_name;
              if (parsedData.last_name) updates.last_name = parsedData.last_name;
              if (parsedData.email) updates.email = parsedData.email;
              if (parsedData.phone) updates.phone = parsedData.phone;
              if (parsedData.city) updates.city = parsedData.city;
              if (parsedData.country) updates.country = parsedData.country;
              if (parsedData.linkedin) updates.linkedin = parsedData.linkedin;
              if (parsedData.github) updates.github = parsedData.github;
              if (parsedData.portfolio) updates.portfolio = parsedData.portfolio;
              if (parsedData.total_experience) updates.total_experience = parsedData.total_experience;
              if (parsedData.highest_education) updates.highest_education = parsedData.highest_education;
              if (parsedData.current_salary) updates.current_salary = parsedData.current_salary;
              if (parsedData.expected_salary) updates.expected_salary = parsedData.expected_salary;
              if (parsedData.skills && parsedData.skills.length > 0) updates.skills = parsedData.skills;
              if (parsedData.certifications && parsedData.certifications.length > 0) updates.certifications = parsedData.certifications;
              if (parsedData.education && parsedData.education.length > 0) updates.education = parsedData.education;
              if (parsedData.languages && parsedData.languages.length > 0) updates.languages = parsedData.languages;
              if (parsedData.cover_letter) updates.cover_letter = parsedData.cover_letter;

              if (parsedData.work_experience && parsedData.work_experience.length > 0) {
                updates.professional_experience = normalizeWorkExperience(parsedData.work_experience as any);
              }

              setLocalProfile(prev => ({ ...prev, ...updates }));
              updateProfile(updates as any);
            }
          }}
        />

        {/* Version History */}
        <ProfileVersionHistory onRestore={handleRestoreFromHistory} />

        {/* AI Provider Configuration */}
        <Card id="api-key-section" className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              AI Provider Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configure your AI providers for resume tailoring and cover letter generation. 
              You can use OpenAI (GPT-4o-mini) or Kimi K2 (recommended for best results).
            </p>

            {/* Provider Selection */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Active AI Provider</Label>
              <Select
                value={localProfile.preferred_ai_provider || 'openai'}
                onValueChange={(value) => {
                  updateLocalField('preferred_ai_provider', value);
                  updateProfile({ preferred_ai_provider: value });
                }}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai" disabled={!localProfile.openai_enabled}>
                    OpenAI (GPT-4o-mini) {!localProfile.openai_enabled && '(Disabled)'}
                  </SelectItem>
                  <SelectItem value="kimi" disabled={!localProfile.kimi_enabled}>
                    Kimi K2 (Recommended) {!localProfile.kimi_enabled && '(Disabled)'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* OpenAI Section */}
            <div className={`space-y-3 p-4 rounded-lg border ${localProfile.openai_enabled ? 'bg-background' : 'bg-muted/50 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">OpenAI</span>
                  <Badge variant={localProfile.preferred_ai_provider === 'openai' ? 'default' : 'secondary'}>
                    {localProfile.preferred_ai_provider === 'openai' ? 'Active' : 'Standby'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="openai-toggle" className="text-sm text-muted-foreground">
                    {localProfile.openai_enabled ? 'Enabled' : 'Disabled'}
                  </Label>
                  <Switch
                    id="openai-toggle"
                    checked={localProfile.openai_enabled ?? true}
                    onCheckedChange={(checked) => {
                      updateLocalField('openai_enabled', checked);
                      updateProfile({ openai_enabled: checked });
                      if (!checked && localProfile.preferred_ai_provider === 'openai') {
                        updateLocalField('preferred_ai_provider', 'kimi');
                        updateProfile({ preferred_ai_provider: 'kimi' });
                      }
                    }}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Input 
                  type="password"
                  placeholder="sk-..."
                  value={localProfile.openai_api_key || ''}
                  onChange={(e) => updateLocalField('openai_api_key', e.target.value)}
                  className="flex-1"
                  disabled={!localProfile.openai_enabled}
                />
                <Button 
                  variant="outline"
                  onClick={testApiKey}
                  disabled={!localProfile.openai_api_key || isTestingKey || !localProfile.openai_enabled}
                  size="sm"
                >
                  {isTestingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
                <Button 
                  onClick={() => {
                    if (localProfile.openai_api_key) {
                      updateProfile({ openai_api_key: localProfile.openai_api_key });
                      toast.success('OpenAI API key saved!');
                    }
                  }}
                  disabled={!localProfile.openai_api_key || !localProfile.openai_enabled}
                  size="sm"
                >
                  Save
                </Button>
              </div>
              
              {localProfile.openai_api_key && localProfile.openai_enabled && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  OpenAI API key configured
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Get your API key from{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  OpenAI Platform
                </a>
                . Uses GPT-4o-mini.
              </p>
            </div>

            {/* Kimi K2 Section */}
            <div className={`space-y-3 p-4 rounded-lg border ${localProfile.kimi_enabled ? 'bg-background border-green-500/50' : 'bg-muted/50 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Kimi K2</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    Recommended
                  </Badge>
                  <Badge variant={localProfile.preferred_ai_provider === 'kimi' ? 'default' : 'secondary'}>
                    {localProfile.preferred_ai_provider === 'kimi' ? 'Active' : 'Standby'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="kimi-toggle" className="text-sm text-muted-foreground">
                    {localProfile.kimi_enabled ? 'Enabled' : 'Disabled'}
                  </Label>
                  <Switch
                    id="kimi-toggle"
                    checked={localProfile.kimi_enabled ?? true}
                    onCheckedChange={(checked) => {
                      updateLocalField('kimi_enabled', checked);
                      updateProfile({ kimi_enabled: checked });
                      if (!checked && localProfile.preferred_ai_provider === 'kimi') {
                        updateLocalField('preferred_ai_provider', 'openai');
                        updateProfile({ preferred_ai_provider: 'openai' });
                      }
                    }}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Input 
                  type="password"
                  placeholder="sk-..."
                  value={localProfile.kimi_api_key || ''}
                  onChange={(e) => updateLocalField('kimi_api_key', e.target.value)}
                  className="flex-1"
                  disabled={!localProfile.kimi_enabled}
                />
                <Button 
                  variant="outline"
                  onClick={testKimiApiKey}
                  disabled={!localProfile.kimi_api_key || isTestingKimiKey || !localProfile.kimi_enabled}
                  size="sm"
                >
                  {isTestingKimiKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
                <Button 
                  onClick={() => {
                    if (localProfile.kimi_api_key) {
                      updateProfile({ kimi_api_key: localProfile.kimi_api_key });
                      toast.success('Kimi K2 API key saved!');
                    }
                  }}
                  disabled={!localProfile.kimi_api_key || !localProfile.kimi_enabled}
                  size="sm"
                >
                  Save
                </Button>
              </div>
              
              {localProfile.kimi_api_key && localProfile.kimi_enabled && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Kimi K2 API key configured
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Get your API key from{' '}
                <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Moonshot AI Platform
                </a>
                . Best for agentic coding and complex reasoning.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* API Usage Chart */}
        <ApiUsageChart />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>First Name</Label>
              <Input 
                value={localProfile.first_name || ''} 
                onChange={(e) => updateLocalField('first_name', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input 
                value={localProfile.last_name || ''} 
                onChange={(e) => updateLocalField('last_name', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input 
                value={localProfile.email || ''} 
                onChange={(e) => updateLocalField('email', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input 
                value={localProfile.phone || ''} 
                onChange={(e) => updateLocalField('phone', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>City</Label>
              <Input 
                value={localProfile.city || ''} 
                onChange={(e) => updateLocalField('city', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Country</Label>
              <Input 
                value={localProfile.country || ''} 
                onChange={(e) => updateLocalField('country', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Total Experience</Label>
              <Input 
                value={localProfile.total_experience || ''} 
                onChange={(e) => updateLocalField('total_experience', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Notice Period</Label>
              <Input 
                value={localProfile.notice_period || ''} 
                onChange={(e) => updateLocalField('notice_period', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>LinkedIn</Label>
              <Input 
                value={localProfile.linkedin || ''} 
                onChange={(e) => updateLocalField('linkedin', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>GitHub</Label>
              <Input 
                value={localProfile.github || ''} 
                onChange={(e) => updateLocalField('github', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Portfolio</Label>
              <Input 
                value={localProfile.portfolio || ''} 
                onChange={(e) => updateLocalField('portfolio', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Highest Education</Label>
              <Input 
                value={localProfile.highest_education || ''} 
                onChange={(e) => updateLocalField('highest_education', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Current Salary</Label>
              <Input 
                value={localProfile.current_salary || ''} 
                onChange={(e) => updateLocalField('current_salary', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Expected Salary</Label>
              <Input 
                value={localProfile.expected_salary || ''} 
                onChange={(e) => updateLocalField('expected_salary', e.target.value)}
                readOnly={!editMode} 
                className="mt-1" 
              />
            </div>
          </CardContent>
        </Card>

        {/* ATS Knockout Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              ATS Knockout Questions (Auto-Pass Answers)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              These answers are optimized to pass ATS screening. Toggle to adjust.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Are you 18 years or older?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-green-500" />
                  <span>Legally authorized to work?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Willing to relocate?</span>
                <Switch 
                  checked={localProfile.willing_to_relocate ?? true}
                  onCheckedChange={(v) => updateLocalField('willing_to_relocate', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Requires visa sponsorship?</span>
                <Switch 
                  checked={localProfile.visa_required ?? false}
                  onCheckedChange={(v) => updateLocalField('visa_required', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Veteran status?</span>
                <Switch 
                  checked={localProfile.veteran_status ?? false}
                  onCheckedChange={(v) => updateLocalField('veteran_status', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Have a disability?</span>
                <Switch 
                  checked={localProfile.disability ?? false}
                  onCheckedChange={(v) => updateLocalField('disability', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Security clearance?</span>
                <Switch 
                  checked={localProfile.security_clearance ?? true}
                  onCheckedChange={(v) => updateLocalField('security_clearance', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>Driving license?</span>
                <Switch 
                  checked={localProfile.driving_license ?? true}
                  onCheckedChange={(v) => updateLocalField('driving_license', v)}
                  disabled={!editMode}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Consent to background check?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Consent to drug test?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Willing to travel?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Remote work capable?</span>
                </div>
                <Badge variant="secondary">Yes</Badge>
              </div>
            </div>
            
            {/* Gender */}
            <div className="mt-4">
              <Label>Gender (EEO)</Label>
              {editMode ? (
                <Select 
                  value={localProfile.gender || ''}
                  onValueChange={(v) => updateLocalField('gender', v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Non-binary">Non-binary</SelectItem>
                    <SelectItem value="Prefer not to answer">Prefer not to answer</SelectItem>
                    <SelectItem value="Decline to self-identify">Decline to self-identify</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={localProfile.gender || ''} readOnly className="mt-1" />
              )}
            </div>
            
            {/* Hispanic/Latino */}
            <div className="flex items-center justify-between p-3 border rounded-lg mt-4">
              <span>Are you Hispanic/Latino?</span>
              <Switch 
                checked={localProfile.hispanic_latino ?? false}
                onCheckedChange={(v) => updateLocalField('hispanic_latino', v)}
                disabled={!editMode}
              />
            </div>
            
            {/* Race/Ethnicity */}
            <div className="mt-4">
              <Label>Race/Ethnicity (EEO)</Label>
              {editMode ? (
                <Select 
                  value={localProfile.race_ethnicity || ''}
                  onValueChange={(v) => updateLocalField('race_ethnicity', v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Decline to self-identify">Decline to self-identify</SelectItem>
                    <SelectItem value="White">White</SelectItem>
                    <SelectItem value="Black or African American">Black or African American</SelectItem>
                    <SelectItem value="Hispanic or Latino">Hispanic or Latino</SelectItem>
                    <SelectItem value="Asian">Asian</SelectItem>
                    <SelectItem value="Native American">Native American</SelectItem>
                    <SelectItem value="Two or More Races">Two or More Races</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={localProfile.race_ethnicity || ''} readOnly className="mt-1" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Skills - Editable */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Skills ({(localProfile.skills || []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="Skill name" 
                  value={newSkill.name}
                  onChange={(e) => setNewSkill(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1"
                />
                <Input 
                  type="number"
                  placeholder="Years"
                  value={newSkill.years}
                  onChange={(e) => setNewSkill(prev => ({ ...prev, years: parseInt(e.target.value) || 7 }))}
                  className="w-20"
                />
                <Select 
                  value={newSkill.category}
                  onValueChange={(v: any) => setNewSkill(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COMPETENCY_CATEGORY}>Core Competency</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="tools">Tools</SelectItem>
                    <SelectItem value="soft">Soft Skills</SelectItem>
                    <SelectItem value="languages">Languages</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={addSkill} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            {/* Display skills grouped by category with comma separation */}
            {(() => {
              const skills = localProfile.skills || [];
              const grouped: Record<string, any[]> = {};
              skills.forEach((skill: any) => {
                const cat = skill.category || 'technical';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(skill);
              });
              
              const categoryLabels: Record<string, string> = {
                [COMPETENCY_CATEGORY]: 'Core Competencies',
                technical: 'Technical',
                tools: 'Tools',
                soft: 'Leadership',
                languages: 'Languages'
              };
              
              return (
                <div className="space-y-3">
                  {Object.entries(grouped).map(([category, categorySkills]) => (
                    <div key={category}>
                      <span className="text-sm font-medium text-foreground">{categoryLabels[category] || category}: </span>
                      <span className="text-sm text-muted-foreground">
                        {categorySkills.map((skill: any, i: number) => (
                          <span key={skill.name}>
                            {skill.name}
                            {editMode && (
                              <X 
                                className="inline-block h-3 w-3 ml-1 cursor-pointer hover:text-destructive" 
                                onClick={() => removeSkill(skills.indexOf(skill))}
                              />
                            )}
                            {i < categorySkills.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Live duplicate + rule warnings, and the combined print preview */}
            {(() => {
              const skills = (localProfile.skills || []) as any[];
              const { competencies } = splitSkillLists(skills as any);
              const typedDuplicate =
                newSkill.name.trim() &&
                skills.some(
                  (s: any) =>
                    String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') ===
                    newSkill.name.toLowerCase().replace(/[^a-z0-9]/g, '')
                );
              const cross = crossListDuplicates(skills as any);
              const errors = validateSkills(skills as any);
              const preview = combinedSkillsPreview(skills as any);

              return (
                <div className="mt-4 space-y-2">
                  {typedDuplicate && (
                    <p className="text-xs text-destructive">
                      "{newSkill.name}" is already in your lists - each term prints once.
                    </p>
                  )}
                  {cross.length > 0 && (
                    <p className="text-xs text-destructive">
                      In both lists: {cross.join(', ')}. Remove it from one.
                    </p>
                  )}
                  {errors
                    .filter((e) => !e.startsWith('Duplicate term in both lists'))
                    .map((e) => (
                      <p key={e} className="text-xs text-destructive">{e}</p>
                    ))}
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold tracking-wide text-foreground">TECHNICAL SKILLS</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {preview.length ? preview.join(' | ') : 'No terms yet.'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Prints as one section: {competencies.length} competencies first, then technical terms.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Skills not in your profile will default to 7 years for automation
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="Add certification" 
                  id="newCert"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCertification((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  onClick={() => {
                    const input = document.getElementById('newCert') as HTMLInputElement;
                    addCertification(input.value);
                    input.value = '';
                  }}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            {editMode && (
              <p className="text-xs text-muted-foreground mb-3">
                {CERTIFICATIONS_CAP_MESSAGE} Only the top {CERTIFICATIONS_MAX} are sent to the extension
                ({(localProfile.certifications || []).length} stored).
              </p>
            )}
            {editMode ? (
              <div className="space-y-2">
                {(localProfile.certifications || []).map((cert: string, i: number) => (
                  <div
                    key={`${cert}-${i}`}
                    draggable
                    onDragStart={() => setDraggedCertification(i)}
                    onDragEnd={() => setDraggedCertification(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedCertification === null || draggedCertification === i) return;
                      moveCertification(draggedCertification, i);
                      setDraggedCertification(null);
                    }}
                    className={`flex items-center gap-2 rounded-md border p-2 ${i >= CERTIFICATIONS_MAX ? 'opacity-50' : ''}`}
                  >
                    <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden="true" />
                    <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1 text-sm">{cert}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remove ${cert}`}
                      onClick={() => removeCertification(i)}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(localProfile.certifications || []).map((cert: string, i: number) => (
                  <Badge key={i} variant="outline" className={i >= CERTIFICATIONS_MAX ? 'opacity-50' : ''}>
                    {cert}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Languages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="Language name" 
                  id="newLangName"
                  className="flex-1"
                />
                <Select defaultValue="Professional">
                  <SelectTrigger className="w-40" id="newLangProf">
                    <SelectValue placeholder="Proficiency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Native">Native</SelectItem>
                    <SelectItem value="Fluent">Fluent</SelectItem>
                    <SelectItem value="Professional">Professional</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Basic">Basic</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => {
                    const nameInput = document.getElementById('newLangName') as HTMLInputElement;
                    const profTrigger = document.getElementById('newLangProf');
                    const proficiency = profTrigger?.textContent || 'Professional';
                    if (nameInput.value.trim()) {
                      const langs = [...(localProfile.languages || []), { name: nameInput.value.trim(), proficiency }];
                      updateLocalField('languages', langs);
                      nameInput.value = '';
                    }
                  }}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(localProfile.languages || []).map((lang: any, i: number) => (
                <Badge key={i} variant="secondary" className="flex items-center gap-1">
                  {lang.name} - {lang.proficiency}
                  {editMode && (
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => {
                        const langs = [...(localProfile.languages || [])];
                        langs.splice(i, 1);
                        updateLocalField('languages', langs);
                      }}
                    />
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Work Experience */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Work Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={() => {
                    const newExp = {
                      id: crypto.randomUUID(),
                      title: 'New Position - 2024 - Present',
                      company: 'Company Name',
                      location: '',
                      description: '',
                      skills: [],
                      bullets: [
                        'Add your key achievement or responsibility here',
                        'Use metrics and numbers where possible (e.g., Improved performance by 30%)'
                      ]
                    };
                    updateLocalField('professional_experience', [...(localProfile.professional_experience || []), newExp]);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Work Experience
                </Button>
                {(localProfile.professional_experience || []).length > 0 && (
                  <Button 
                    variant="destructive" 
                    className="gap-2"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear ALL work experience? This will remove all entries from your profile and cannot be undone.')) {
                        updateLocalField('professional_experience', []);
                        toast.success('Work experience cleared. Click Save to persist changes.');
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
              </div>
            )}
            {(localProfile.professional_experience || []).map((exp: any, expIndex: number) => (
              <div key={exp.id} className="border rounded-lg p-4 relative">
                {editMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => {
                      const exps = [...(localProfile.professional_experience || [])];
                      exps.splice(expIndex, 1);
                      updateLocalField('professional_experience', exps);
                    }}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 mr-8">
                    {editMode ? (
                      <div className="space-y-2">
                        <Input
                          value={exp.title || ''}
                          onChange={(e) => {
                            const exps = [...(localProfile.professional_experience || [])];
                            exps[expIndex] = { ...exps[expIndex], title: e.target.value };
                            updateLocalField('professional_experience', exps);
                          }}
                          onBlur={() => {
                            const exps = [...(localProfile.professional_experience || [])];
                            const { title, employment_type } = splitTitleAndEmploymentType(
                              exps[expIndex]?.title,
                              exps[expIndex]?.employment_type
                            );
                            exps[expIndex] = { ...exps[expIndex], title, employment_type };
                            updateLocalField('professional_experience', exps);
                          }}
                          placeholder="Job Title (e.g., Senior Software Engineer)"
                          className="font-semibold"
                        />
                        <div>
                          <Label className="text-xs text-muted-foreground">Employment type</Label>
                          <Select
                            value={exp.employment_type || 'none'}
                            onValueChange={(v) => {
                              const exps = [...(localProfile.professional_experience || [])];
                              exps[expIndex] = { ...exps[expIndex], employment_type: v === 'none' ? '' : v };
                              updateLocalField('professional_experience', exps);
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Not specified" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not specified</SelectItem>
                              {EMPLOYMENT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Job title alone in the Title field - recruiters search on the title.
                          </p>
                        </div>
                        <Input
                          value={exp.company || ''}
                          onChange={(e) => {
                            const exps = [...(localProfile.professional_experience || [])];
                            exps[expIndex] = { ...exps[expIndex], company: e.target.value };
                            updateLocalField('professional_experience', exps);
                          }}
                          onBlur={() => {
                            const exps = [...(localProfile.professional_experience || [])];
                            const { company, location } = normaliseCompany(exps[expIndex]?.company);
                            exps[expIndex] = {
                              ...exps[expIndex],
                              company,
                              location: normaliseLocation(location || exps[expIndex]?.location || ''),
                            };
                            updateLocalField('professional_experience', exps);
                          }}
                          placeholder="Company"
                        />
                        {(() => {
                          const split = normaliseCompany(exp.company);
                          const previewLocation = normaliseLocation(split.location || exp.location || '');
                          return (
                            <p className="text-xs text-muted-foreground">
                              Company: <span className="text-foreground">{split.company || '-'}</span>
                              {'   '}
                              Location: <span className="text-foreground">{previewLocation || '-'}</span>
                            </p>
                          );
                        })()}
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Location</Label>
                            <Input
                              value={exp.location === 'Remote' ? 'Remote' : (exp.location || '')}
                              disabled={exp.location === 'Remote'}
                              onChange={(e) => {
                                const raw = e.target.value.slice(0, 60);
                                const exps = [...(localProfile.professional_experience || [])];
                                exps[expIndex] = { ...exps[expIndex], location: raw };
                                updateLocalField('professional_experience', exps);
                              }}
                              onBlur={() => {
                                const exps = [...(localProfile.professional_experience || [])];
                                exps[expIndex] = {
                                  ...exps[expIndex],
                                  location: normaliseLocation(exps[expIndex]?.location || ''),
                                };
                                updateLocalField('professional_experience', exps);
                              }}
                              placeholder="Dublin, Ireland"
                              maxLength={60}
                            />
                            {(() => {
                              const err = validateLocation(exp.location);
                              return err ? (
                                <p className="text-xs text-destructive mt-0.5">{err}</p>
                              ) : null;
                            })()}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              City, Country - e.g. Dublin, Ireland. Also accepted: City, State, Country / Remote / Remote, Country. Workday and iCIMS map City and Country to separate structured fields, so the comma matters.
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={exp.location === 'Remote'}
                              onChange={(e) => {
                                const exps = [...(localProfile.professional_experience || [])];
                                exps[expIndex] = { ...exps[expIndex], location: e.target.checked ? 'Remote' : '' };
                                updateLocalField('professional_experience', exps);
                              }}
                            />
                            Remote
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Start Date (MM-YYYY)</Label>
                            <Input
                              type="text"
                              value={exp.startDate || ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9-/]/g, '');
                                const exps = [...(localProfile.professional_experience || [])];
                                exps[expIndex] = { ...exps[expIndex], startDate: raw };
                                updateLocalField('professional_experience', exps);
                              }}
                              placeholder="e.g. 01-2023"
                              maxLength={7}
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">End Date (MM-YYYY)</Label>
                            <Input
                              type="text"
                              value={exp.endDate === 'Present' ? '' : (exp.endDate || '')}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9-/]/g, '');
                                const exps = [...(localProfile.professional_experience || [])];
                                exps[expIndex] = { ...exps[expIndex], endDate: raw || 'Present' };
                                updateLocalField('professional_experience', exps);
                              }}
                              placeholder="Empty = Present"
                              maxLength={7}
                            />
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(!exp.endDate || exp.endDate === 'Present') ? 'Current role (Present)' : ''}
                            </p>
                          </div>
                        </div>
                        
                        {/* Bullet Points / Achievements Section */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">Achievements / Responsibilities</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const exps = [...(localProfile.professional_experience || [])];
                                const currentBullets = exps[expIndex].bullets || [];
                                exps[expIndex] = { 
                                  ...exps[expIndex], 
                                  bullets: [...currentBullets, 'New achievement or responsibility'] 
                                };
                                updateLocalField('professional_experience', exps);
                              }}
                              className="h-7 px-2 gap-1 text-xs"
                            >
                              <Plus className="h-3 w-3" />
                              Add Bullet
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(exp.bullets || []).map((bullet: string, bulletIndex: number) => (
                              <div key={bulletIndex} className="flex gap-2 items-start">
                                <span className="text-muted-foreground mt-2 text-sm">•</span>
                                <Textarea
                                  value={bullet}
                                  onChange={(e) => {
                                    const exps = [...(localProfile.professional_experience || [])];
                                    const bullets = [...(exps[expIndex].bullets || [])];
                                    bullets[bulletIndex] = e.target.value;
                                    exps[expIndex] = { ...exps[expIndex], bullets };
                                    updateLocalField('professional_experience', exps);
                                  }}
                                  placeholder="Describe your achievement with metrics (e.g., Reduced load time by 40%)"
                                  className="flex-1 min-h-[60px] resize-none text-sm"
                                  rows={2}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => {
                                    const exps = [...(localProfile.professional_experience || [])];
                                    const bullets = [...(exps[expIndex].bullets || [])];
                                    bullets.splice(bulletIndex, 1);
                                    exps[expIndex] = { ...exps[expIndex], bullets };
                                    updateLocalField('professional_experience', exps);
                                  }}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                            {(!exp.bullets || exp.bullets.length === 0) && (
                              <p className="text-xs text-muted-foreground italic">
                                No bullet points yet. Add achievements to improve your CV tailoring.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold">{exp.company}</h3>
                        {exp.location && (
                          <p className="text-sm text-muted-foreground">{exp.location}</p>
                        )}
                        <div className="flex justify-between items-baseline">
                          {(() => {
                            const extracted = extractDatesFromTitle(exp.title || '');
                            const cleanTitle = extracted.cleanTitle || exp.title;
                            return <p className="text-muted-foreground">{cleanTitle}</p>;
                          })()}
                          {(() => {
                            const dr = formatDateRange(exp.startDate, exp.endDate, exp.title);
                            return dr ? <span className="text-sm text-muted-foreground whitespace-nowrap ml-4">{dr}</span> : null;
                          })()}
                        </div>
                        {/* Display bullets in view mode */}
                        {exp.bullets && exp.bullets.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {exp.bullets.map((bullet: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span>•</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(exp.skills || []).slice(0, 6).map((skill: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Work Experience ATS Preview */}
        <WorkExperiencePreview workExperience={localProfile.professional_experience || []} />

        {/* Relevant Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5" />
              Selected Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={() => {
                    const newProject = {
                      id: crypto.randomUUID(),
                      name: 'Project Name',
                      role: 'Your Role - 2024 - Present',
                      description: '',
                      skills: [],
                      bullets: [
                        'Describe the project and your contribution',
                        'Highlight technologies used and outcomes achieved'
                      ]
                    };
                    updateLocalField('relevant_projects', [...(localProfile.relevant_projects || []), newProject]);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Project
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const examples = [
                      {
                        id: crypto.randomUUID(),
                        name: 'SignalDesk — Real-Time Market-Sentiment Engine',
                        role: '',
                        techStack: 'Python, LLMs (RAG), Kafka, FastAPI, React, AWS',
                        description: 'Streams live financial news and filings through an LLM that extracts entities and sentiment with inline source citations and a hallucination-eval harness, surfacing ticker-level signals on a live dashboard updated within seconds of publication.',
                        liveUrl: 'https://maxmilliamokafor.github.io/signaldesk/',
                        codeUrl: 'https://github.com/MaxmilliamOkafor/signaldesk',
                        bullets: [],
                        skills: [],
                      },
                      {
                        id: crypto.randomUUID(),
                        name: 'DriftGuard — Self-Healing MLOps Platform',
                        role: '',
                        techStack: 'Python, MLflow, Evidently, Docker, Kubernetes, GitHub Actions',
                        description: 'Self-healing MLOps framework that watches a deployed model for data and concept drift and automatically retrains, validates, and canary-deploys a new version with zero human intervention — a public dashboard replays drift events and the auto-recovery in real time.',
                        liveUrl: 'https://maxmilliamokafor.github.io/driftguard/',
                        codeUrl: 'https://github.com/MaxmilliamOkafor/driftguard',
                        bullets: [],
                        skills: [],
                      },
                      {
                        id: crypto.randomUUID(),
                        name: 'LatencyLab — Sub-30ms Transformer Serving Benchmark',
                        role: '',
                        techStack: 'PyTorch, ONNX Runtime, Triton, quantisation / distillation',
                        description: 'Takes one transformer and compresses it through quantisation, distillation, and ONNX/Triton, cutting p99 inference from ~180ms to under 30ms at a fraction of the cost — an interactive benchmark lets recruiters compare accuracy vs. latency vs. spend per technique.',
                        liveUrl: 'https://maxmilliamokafor.github.io/latencylab/',
                        codeUrl: 'https://github.com/MaxmilliamOkafor/latencylab',
                        bullets: [],
                        skills: [],
                      },
                      {
                        id: crypto.randomUUID(),
                        name: 'LedgerLens — Explainable Credit-Risk Scoring API',
                        role: '',
                        techStack: 'Python, XGBoost, SHAP, FastAPI, Fairlearn, Docker',
                        description: "Credit-risk model served as an API that returns a per-decision SHAP explanation, a bias/fairness audit, and a published model card — an interactive demo lets you change an applicant's inputs and watch the score and the reasons update live.",
                        liveUrl: 'https://maxmilliamokafor.github.io/ledgerlens/',
                        codeUrl: 'https://github.com/MaxmilliamOkafor/ledgerlens',
                        bullets: [],
                        skills: [],
                      },
                    ];
                    updateLocalField('relevant_projects', [...(localProfile.relevant_projects || []), ...examples]);
                    toast.success('Example portfolio added. Click Save to persist.');
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Load Example Portfolio
                </Button>
                {(localProfile.relevant_projects || []).length > 0 && (
                  <Button 
                    variant="destructive" 
                    className="gap-2"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear ALL projects? This cannot be undone.')) {
                        updateLocalField('relevant_projects', []);
                        toast.success('Projects cleared. Click Save to persist changes.');
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
              </div>
            )}
            {(localProfile.relevant_projects || []).map((project: any, projectIndex: number) => (
              <div key={project.id} className="border rounded-lg p-4 relative">
                {editMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => {
                      const projects = [...(localProfile.relevant_projects || [])];
                      projects.splice(projectIndex, 1);
                      updateLocalField('relevant_projects', projects);
                    }}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 mr-8">
                    {editMode ? (
                      <div className="space-y-2">
                        <Input 
                          value={project.name || ''} 
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = { ...projects[projectIndex], name: e.target.value };
                            updateLocalField('relevant_projects', projects);
                          }}
                          placeholder="Project Name"
                          className="font-semibold"
                        />
                        <Input 
                          value={project.role || ''} 
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = { ...projects[projectIndex], role: e.target.value };
                            updateLocalField('relevant_projects', projects);
                          }}
                          placeholder="Your Role with dates (e.g., AI Product Manager - 2022 - 2023)"
                        />
                        <Input
                          value={project.techStack || ''}
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = { ...projects[projectIndex], techStack: e.target.value };
                            updateLocalField('relevant_projects', projects);
                          }}
                          placeholder="Tech Stack (e.g., Python, FastAPI, React, AWS)"
                          maxLength={60}
                        />
                        <p className="text-xs text-muted-foreground">
                          Tech stack: {(project.techStack || '').length}/60 characters - it prints right-aligned on the title line.
                        </p>
                        <Textarea
                          value={project.description || ''}
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = {
                              ...projects[projectIndex],
                              description: e.target.value.slice(0, PROJECT_DESCRIPTION_MAX),
                            };
                            updateLocalField('relevant_projects', projects);
                          }}
                          maxLength={PROJECT_DESCRIPTION_MAX}
                          rows={3}
                          className="text-sm resize-none"
                          placeholder="Streams live financial news through an LLM that extracts entities and sentiment, with inline citations."
                        />
                        <p className={`text-xs ${(project.description || '').length > PROJECT_DESCRIPTION_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>
                          Description: {(project.description || '').length}/{PROJECT_DESCRIPTION_MAX} characters - one rendered line per project.
                        </p>
                        <Input
                          value={project.liveUrl || ''}
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = { ...projects[projectIndex], liveUrl: e.target.value };
                            updateLocalField('relevant_projects', projects);
                          }}
                          placeholder="Live Demo URL (https://...)"
                        />
                        <Input
                          value={project.codeUrl || ''}
                          onChange={(e) => {
                            const projects = [...(localProfile.relevant_projects || [])];
                            projects[projectIndex] = { ...projects[projectIndex], codeUrl: e.target.value };
                            updateLocalField('relevant_projects', projects);
                          }}
                          placeholder="Code / GitHub URL (https://github.com/...)"
                        />
                        {(() => {
                          const issues = projectIssues(project);
                          return issues.length ? (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                              <p className="text-xs font-medium text-destructive">Incomplete project</p>
                              {issues.map((i) => (
                                <p key={i} className="text-xs text-destructive">- {i}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Complete - both links present.</p>
                          );
                        })()}
                        <p className="text-sm text-muted-foreground italic">
                          💡 Include dates in your role above for better CV generation
                        </p>
                        
                        {/* Bullet Points / Achievements Section */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">Achievements / Contributions</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const projects = [...(localProfile.relevant_projects || [])];
                                const currentBullets = projects[projectIndex].bullets || [];
                                projects[projectIndex] = { 
                                  ...projects[projectIndex], 
                                  bullets: [...currentBullets, 'New achievement or contribution'] 
                                };
                                updateLocalField('relevant_projects', projects);
                              }}
                              className="h-7 px-2 gap-1 text-xs"
                            >
                              <Plus className="h-3 w-3" />
                              Add Bullet
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(project.bullets || []).map((bullet: string, bulletIndex: number) => (
                              <div key={bulletIndex} className="flex gap-2 items-start">
                                <span className="text-muted-foreground mt-2 text-sm">•</span>
                                <Textarea
                                  value={bullet}
                                  onChange={(e) => {
                                    const projects = [...(localProfile.relevant_projects || [])];
                                    const bullets = [...(projects[projectIndex].bullets || [])];
                                    bullets[bulletIndex] = e.target.value;
                                    projects[projectIndex] = { ...projects[projectIndex], bullets };
                                    updateLocalField('relevant_projects', projects);
                                  }}
                                  placeholder="Describe your contribution with impact (e.g., Built AI pipeline that processed 10k+ records)"
                                  className="flex-1 min-h-[60px] resize-none text-sm"
                                  rows={2}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => {
                                    const projects = [...(localProfile.relevant_projects || [])];
                                    const bullets = [...(projects[projectIndex].bullets || [])];
                                    bullets.splice(bulletIndex, 1);
                                    projects[projectIndex] = { ...projects[projectIndex], bullets };
                                    updateLocalField('relevant_projects', projects);
                                  }}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                            {(!project.bullets || project.bullets.length === 0) && (
                              <p className="text-xs text-muted-foreground italic">
                                No bullet points yet. Add achievements to improve your CV tailoring.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold">
                          {project.name}
                          {project.techStack && (
                            <span className="font-normal text-muted-foreground"> — {project.techStack}</span>
                          )}
                        </h3>
                        <p className="text-muted-foreground">{project.role}</p>
                        {/* Display bullets in view mode */}
                        {project.bullets && project.bullets.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {project.bullets.map((bullet: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span>•</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(project.liveUrl || project.codeUrl) && (
                          <p className="mt-2 text-sm">
                            {project.liveUrl && (
                              <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                Live demo ↗
                              </a>
                            )}
                            {project.liveUrl && project.codeUrl && <span className="text-muted-foreground"> · </span>}
                            {project.codeUrl && (
                              <a href={project.codeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                Code ↗
                              </a>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!editMode && (project.startDate || project.endDate) && (
                    <Badge variant="outline">{formatDateRange(project.startDate, project.endDate)}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(project.skills || []).slice(0, 6).map((skill: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Relevant Projects Preview */}
        <RelevantProjectsPreview projects={localProfile.relevant_projects || []} />

        {/* Complete CV PDF Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Complete CV Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Generate a complete PDF preview to verify that both Professional Experience and Technical Projects 
              sections display correctly with the ATS-optimized formatting.
            </p>
            <CVPreviewModal profile={localProfile} />
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Education
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode && (
              <Button 
                variant="outline" 
                className="w-full mb-4 gap-2"
                onClick={() => {
                  const newEdu = {
                    id: crypto.randomUUID(),
                    degree: 'Degree Name',
                    institution: 'Institution Name',
                    gpa: '',
                    start_year: '',
                    end_year: '',
                    graduationDate: ''
                  };
                  updateLocalField('education', [...(localProfile.education || []), newEdu]);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Education
              </Button>
            )}
            {(localProfile.education || []).map((edu: any, eduIndex: number) => (
              <div key={edu.id} className="border rounded-lg p-4 relative">
                {editMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => {
                      const edus = [...(localProfile.education || [])];
                      edus.splice(eduIndex, 1);
                      updateLocalField('education', edus);
                    }}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                {editMode ? (
                  <div className="space-y-2 mr-8">
                    <Input 
                      value={edu.degree || ''} 
                      onChange={(e) => {
                        const edus = [...(localProfile.education || [])];
                        edus[eduIndex] = { ...edus[eduIndex], degree: e.target.value };
                        updateLocalField('education', edus);
                      }}
                      placeholder="Degree (e.g., Master of Science in AI and Machine Learning)"
                      className="font-semibold"
                    />
                    <Input 
                      value={edu.institution || ''} 
                      onChange={(e) => {
                        const edus = [...(localProfile.education || [])];
                        edus[eduIndex] = { ...edus[eduIndex], institution: e.target.value };
                        updateLocalField('education', edus);
                      }}
                      placeholder="Institution"
                    />
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">From (year)</Label>
                        <Input
                          value={edu.start_year || ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                            const edus = [...(localProfile.education || [])];
                            edus[eduIndex] = { ...edus[eduIndex], start_year: raw };
                            updateLocalField('education', edus);
                          }}
                          placeholder="2016"
                          inputMode="numeric"
                          maxLength={4}
                          className="w-24"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">To (year)</Label>
                        <Input
                          value={edu.end_year === 'Present' ? 'Present' : (edu.end_year || '')}
                          disabled={edu.end_year === 'Present'}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                            const edus = [...(localProfile.education || [])];
                            edus[eduIndex] = { ...edus[eduIndex], end_year: raw };
                            updateLocalField('education', edus);
                          }}
                          placeholder="2020"
                          inputMode="numeric"
                          maxLength={4}
                          className="w-24"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={edu.end_year === 'Present'}
                          onChange={(e) => {
                            const edus = [...(localProfile.education || [])];
                            edus[eduIndex] = { ...edus[eduIndex], end_year: e.target.checked ? 'Present' : '' };
                            updateLocalField('education', edus);
                          }}
                        />
                        Currently studying
                      </label>
                    </div>
                    {(() => {
                      const messages = validateEducationEntry(edu);
                      return messages.length ? (
                        <p className="text-xs text-destructive">
                          {messages.map((m) => m.replace(/^[^:]+:\s*/, '')).join(' ')}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Workday requires both years - saving is blocked until they are filled.
                        </p>
                      );
                    })()}
                    <Textarea 
                      value={edu.description || ''} 
                      onChange={(e) => {
                        const edus = [...(localProfile.education || [])];
                        edus[eduIndex] = { ...edus[eduIndex], description: e.target.value };
                        updateLocalField('education', edus);
                      }}
                      placeholder="Description (optional - relevant coursework, achievements, thesis, etc.)"
                      className="min-h-[60px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Input 
                        value={edu.gpa || ''} 
                        onChange={(e) => {
                          const edus = [...(localProfile.education || [])];
                          edus[eduIndex] = { ...edus[eduIndex], gpa: e.target.value };
                          updateLocalField('education', edus);
                        }}
                        placeholder="GPA (optional)"
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground self-center">
                        Dates are hidden from CV to prevent age bias
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold">{edu.degree}</h3>
                    <p className="text-muted-foreground">{edu.institution}</p>
                    {(edu.start_year || edu.end_year) && (
                      <p className="text-sm text-muted-foreground">
                        {[edu.start_year, edu.end_year].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {edu.description && (
                      <p className="text-sm text-muted-foreground mt-1">{edu.description}</p>
                    )}
                    {edu.gpa && (
                      <p className="text-sm text-muted-foreground mt-1">GPA: {edu.gpa}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cover Letter */}
        <Card>
          <CardHeader>
            <CardTitle>Cover Letter</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={localProfile.cover_letter || ''} 
              onChange={(e) => updateLocalField('cover_letter', e.target.value)}
              readOnly={!editMode} 
              className="min-h-[300px] font-mono text-sm"
            />
          </CardContent>
        </Card>

        {/* ATS Strategy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              ATS Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={localProfile.ats_strategy || ''} 
              onChange={(e) => updateLocalField('ats_strategy', e.target.value)}
              readOnly={!editMode} 
              className="min-h-[150px] text-sm"
              placeholder="Instructions for how the AI should answer ATS questions..."
            />
          </CardContent>
        </Card>

        {/* Excluded Companies */}
        <Card>
          <CardHeader>
            <CardTitle>Excluded Companies</CardTitle>
          </CardHeader>
          <CardContent>
            {editMode && (
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="Add company to exclude" 
                  id="newExcludedCompany"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      if (input.value.trim()) {
                        const companies = [...(localProfile.excluded_companies || []), input.value.trim()];
                        updateLocalField('excluded_companies', companies);
                        input.value = '';
                      }
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  onClick={() => {
                    const input = document.getElementById('newExcludedCompany') as HTMLInputElement;
                    if (input.value.trim()) {
                      const companies = [...(localProfile.excluded_companies || []), input.value.trim()];
                      updateLocalField('excluded_companies', companies);
                      input.value = '';
                    }
                  }}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(localProfile.excluded_companies || []).map((company: string, i: number) => (
                <Badge key={i} variant="destructive" className="text-xs flex items-center gap-1">
                  {company}
                  {editMode && (
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-white" 
                      onClick={() => {
                        const companies = [...(localProfile.excluded_companies || [])];
                        companies.splice(i, 1);
                        updateLocalField('excluded_companies', companies);
                      }}
                    />
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data preview - exactly what the extension reads */}
        <DataPreviewPanel profile={profile || localProfile} />
      </div>
    </AppLayout>
  );
};

export default Profile;
