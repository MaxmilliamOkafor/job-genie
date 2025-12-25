import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { maxmilliamProfile } from '@/data/userProfile';
import { UserProfile } from '@/types';
import { User, Briefcase, GraduationCap, Award, Download } from 'lucide-react';
import { toast } from 'sonner';

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile>(maxmilliamProfile);

  const handleLoadCV = () => {
    setProfile(maxmilliamProfile);
    toast.success('CV data loaded successfully!');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Profile</h1>
            <p className="text-muted-foreground mt-1">Your CV data for auto-applications</p>
          </div>
          <Button onClick={handleLoadCV} className="gap-2">
            <Download className="h-4 w-4" />
            Load My CV Data
          </Button>
        </div>

        {/* Personal Info */}
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
              <Input value={profile.firstName} readOnly className="mt-1" />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={profile.lastName} readOnly className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={profile.email} readOnly className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={profile.phone} readOnly className="mt-1" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={`${profile.city}, ${profile.country}`} readOnly className="mt-1" />
            </div>
            <div>
              <Label>Experience</Label>
              <Input value={profile.totalExperience} readOnly className="mt-1" />
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
            {profile.workExperience.map((exp) => (
              <div key={exp.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{exp.title}</h3>
                    <p className="text-muted-foreground">{exp.company} • {exp.location}</p>
                  </div>
                  <Badge variant="outline">{exp.startDate} - {exp.endDate}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {exp.skills.slice(0, 6).map((skill, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </div>
            ))}
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
            {profile.education.map((edu) => (
              <div key={edu.id} className="border rounded-lg p-4">
                <h3 className="font-semibold">{edu.degree}</h3>
                <p className="text-muted-foreground">{edu.institution}</p>
                <p className="text-sm text-muted-foreground mt-1">GPA: {edu.gpa}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Skills ({profile.skills.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, i) => (
                <Badge key={i} variant="secondary">
                  {skill.name} • {skill.years}y
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cover Letter */}
        <Card>
          <CardHeader>
            <CardTitle>Cover Letter</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={profile.coverLetter} 
              readOnly 
              className="min-h-[300px] font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Profile;
