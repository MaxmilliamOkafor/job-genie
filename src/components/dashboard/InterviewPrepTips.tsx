import * as React from 'react';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BookOpen,
  MessageSquare,
  CheckSquare,
  Building2,
  Lightbulb,
  Target,
} from 'lucide-react';

interface InterviewPrepTipsProps {
  jobTitle?: string;
  company?: string;
  keywords?: string[];
}

interface CheckableItem {
  id: string;
  label: string;
}

function buildCommonQuestions(
  jobTitle?: string,
  company?: string,
  keywords?: string[],
): CheckableItem[] {
  const questions: CheckableItem[] = [];

  // Technical questions based on keywords
  if (keywords && keywords.length > 0) {
    questions.push({
      id: 'tech-1',
      label: `Describe your experience with ${keywords[0]}.`,
    });
    if (keywords.length > 1) {
      questions.push({
        id: 'tech-2',
        label: `How have you used ${keywords[1]} to solve a real-world problem?`,
      });
    }
    if (keywords.length > 2) {
      questions.push({
        id: 'tech-3',
        label: `Compare and contrast ${keywords[0]} and ${keywords[2]}. When would you choose one over the other?`,
      });
    }
  }

  // Behavioral questions
  questions.push(
    {
      id: 'behav-1',
      label: 'Tell me about a time you led a cross-functional project.',
    },
    {
      id: 'behav-2',
      label: 'Describe a situation where you had to deal with a difficult stakeholder.',
    },
    {
      id: 'behav-3',
      label: 'Give an example of a time you failed and what you learned from it.',
    },
  );

  // Company-specific questions
  if (company) {
    questions.push({
      id: 'company-1',
      label: `Why do you want to work at ${company}?`,
    });
    questions.push({
      id: 'company-2',
      label: `What do you know about ${company}'s mission and values?`,
    });
  }

  // Role-specific questions based on job title
  if (jobTitle) {
    questions.push(
      {
        id: 'role-1',
        label: `What makes you a strong fit for the ${jobTitle} role?`,
      },
      {
        id: 'role-2',
        label: `Where do you see yourself growing as a ${jobTitle} in the next two years?`,
      },
    );
  }

  // Generic fallbacks when no context is provided
  if (!keywords?.length && !company && !jobTitle) {
    questions.push(
      { id: 'gen-1', label: 'Walk me through your resume.' },
      { id: 'gen-2', label: 'What is your greatest professional achievement?' },
    );
  }

  return questions;
}

function buildKeywordsToMention(keywords?: string[]): CheckableItem[] {
  if (!keywords || keywords.length === 0) {
    return [
      { id: 'kw-1', label: 'Problem-solving' },
      { id: 'kw-2', label: 'Collaboration' },
      { id: 'kw-3', label: 'Communication' },
      { id: 'kw-4', label: 'Adaptability' },
    ];
  }

  return keywords.map((kw, i) => ({
    id: `kw-${i}`,
    label: kw,
  }));
}

const starMethodItems: CheckableItem[] = [
  {
    id: 'star-s',
    label: 'Situation \u2014 Set the scene and provide context for your story.',
  },
  {
    id: 'star-t',
    label: 'Task \u2014 Describe your responsibility or the challenge you faced.',
  },
  {
    id: 'star-a',
    label: 'Action \u2014 Explain the specific steps you took to address it.',
  },
  {
    id: 'star-r',
    label: 'Result \u2014 Share the outcome and what you learned.',
  },
];

function buildResearchChecklist(company?: string): CheckableItem[] {
  const companyName = company ?? 'the company';
  return [
    { id: 'res-1', label: `Review ${companyName}'s mission statement and core values.` },
    { id: 'res-2', label: `Read recent news or press releases about ${companyName}.` },
    { id: 'res-3', label: `Explore ${companyName}'s products, services, and key competitors.` },
    { id: 'res-4', label: `Look up your interviewers on LinkedIn.` },
    { id: 'res-5', label: `Check Glassdoor for interview experiences at ${companyName}.` },
    { id: 'res-6', label: `Prepare two to three thoughtful questions to ask the interviewer.` },
  ];
}

interface CategoryConfig {
  value: string;
  title: string;
  icon: React.ReactNode;
  badgeLabel: string;
  items: CheckableItem[];
}

export function InterviewPrepTips({
  jobTitle,
  company,
  keywords,
}: InterviewPrepTipsProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const categories: CategoryConfig[] = useMemo(() => {
    const commonQuestions = buildCommonQuestions(jobTitle, company, keywords);
    const keywordItems = buildKeywordsToMention(keywords);
    const researchChecklist = buildResearchChecklist(company);

    return [
      {
        value: 'common-questions',
        title: 'Common Questions',
        icon: <MessageSquare className="h-4 w-4" />,
        badgeLabel: `${commonQuestions.length} questions`,
        items: commonQuestions,
      },
      {
        value: 'keywords',
        title: 'Keywords to Mention',
        icon: <Target className="h-4 w-4" />,
        badgeLabel: `${keywordItems.length} keywords`,
        items: keywordItems,
      },
      {
        value: 'star-method',
        title: 'STAR Method Reminders',
        icon: <Lightbulb className="h-4 w-4" />,
        badgeLabel: '4 steps',
        items: starMethodItems,
      },
      {
        value: 'research-checklist',
        title: 'Research Checklist',
        icon: <Building2 className="h-4 w-4" />,
        badgeLabel: `${researchChecklist.length} items`,
        items: researchChecklist,
      },
    ];
  }, [jobTitle, company, keywords]);

  const totalItems = useMemo(
    () => categories.reduce((sum, cat) => sum + cat.items.length, 0),
    [categories],
  );

  const checkedCount = checkedItems.size;
  const score = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  function toggleItem(id: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Interview Prep Tips
            </CardTitle>
            {(jobTitle || company) && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {jobTitle && <span>{jobTitle}</span>}
                {jobTitle && company && <span> at </span>}
                {company && <span>{company}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {checkedCount}/{totalItems}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Preparation Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Preparation Score</span>
            <span className="font-semibold">{score}%</span>
          </div>
          <Progress value={score} className="h-2" />
        </div>

        {/* Accordion Categories */}
        <Accordion type="multiple" defaultValue={['common-questions']}>
          {categories.map((category) => {
            const catCheckedCount = category.items.filter((item) =>
              checkedItems.has(item.id),
            ).length;

            return (
              <AccordionItem key={category.value} value={category.value}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{category.icon}</span>
                    <span>{category.title}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {category.badgeLabel}
                    </Badge>
                    {catCheckedCount === category.items.length &&
                      category.items.length > 0 && (
                        <Badge className="ml-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Done
                        </Badge>
                      )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-3">
                    {category.items.map((item) => (
                      <li key={item.id} className="flex items-start gap-3">
                        <Checkbox
                          id={item.id}
                          checked={checkedItems.has(item.id)}
                          onCheckedChange={() => toggleItem(item.id)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={item.id}
                          className={`text-sm leading-relaxed cursor-pointer ${
                            checkedItems.has(item.id)
                              ? 'line-through text-muted-foreground'
                              : ''
                          }`}
                        >
                          {item.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

InterviewPrepTips.displayName = 'InterviewPrepTips';
