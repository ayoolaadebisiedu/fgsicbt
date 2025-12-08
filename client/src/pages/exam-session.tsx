import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, Flag, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ExamSession, Question, Exam, Result } from "@shared/schema";

export default function ExamSessionPage() {
  const params = useParams<{ examId: string; sessionId: string }>();
  const [, setLocation] = useLocation();
  const { examId, sessionId } = params;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const { data: session, isLoading: sessionLoading } = useQuery<ExamSession>({
    queryKey: ["/api/exam-sessions", sessionId],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (!sessionId || sessionId === "undefined") {
      // If there's no sessionId in the route, redirect back to exams list
      setLocation("/");
    }
  }, [sessionId, setLocation]);

  const { data: exam } = useQuery<Exam>({
    queryKey: ["/api/exams", examId],
    enabled: !!session,
  });

  const { data: questions, isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["sessionQuestions", session?.id],
    queryFn: async () => {
      if (!session?.sessionQuestionIds || session.sessionQuestionIds.length === 0) {
        return [];
      }
      return apiRequest("POST", "/api/questions/bulk-fetch", { ids: session.sessionQuestionIds });
    },
    enabled: !!session?.sessionQuestionIds && session.sessionQuestionIds.length > 0,
  });

  const saveProgressMutation = useMutation({
    mutationFn: async (data: { answers: Record<string, string>; currentQuestionIndex: number }) => {
      return apiRequest("PATCH", `/api/exam-sessions/${sessionId}`, data);
    },
  });

  const submitExamMutation = useMutation<Result, unknown, void>({
    mutationFn: async () => {
      return apiRequest<Result>("POST", `/api/exam-sessions/${sessionId}/submit`, { answers });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-sessions"] });
      setLocation(`/exam/result/${result.id}`);
    },
  });

  // Initialize exam session state and time
  useEffect(() => {
    if (session && exam && !session.isCompleted) {
      setAnswers(session.answers || {});
      setCurrentQuestionIndex(session.currentQuestionIndex || 0);

      const examDurationSeconds = exam.duration * 60;
      const elapsedSeconds = session.startedAt
        ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
        : 0;
      const initialTime = session.timeRemaining ?? Math.max(0, examDurationSeconds - elapsedSeconds);
      setTimeRemaining(initialTime);
    }
  }, [session, exam]);

  // Handle timer countdown
  useEffect(() => {
    if (timeRemaining <= 0 || session?.isCompleted) {
      return;
    }

    const timerId = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [session?.isCompleted]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining === 0 && !session?.isCompleted && !submitExamMutation.isPending) {
      submitExamMutation.mutate();
    }
  }, [timeRemaining, session?.isCompleted, submitExamMutation]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);
    saveProgressMutation.mutate({
      answers: newAnswers,
      currentQuestionIndex,
    });
  };

  const handleNavigate = (index: number) => {
    saveProgressMutation.mutate({
      answers,
      currentQuestionIndex: index,
    });
    setCurrentQuestionIndex(index);
  };

  const toggleFlag = (index: number) => {
    const newFlagged = new Set(flaggedQuestions);
    if (newFlagged.has(index)) {
      newFlagged.delete(index);
    } else {
      newFlagged.add(index);
    }
    setFlaggedQuestions(newFlagged);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentQuestion = questions?.[currentQuestionIndex];
  const progress = questions ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length;

  if (sessionLoading || !session || !exam || questionsLoading || !questions) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-4xl space-y-4 px-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (session.isCompleted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              This exam has already been submitted. Redirecting...
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-exam-title">
                {exam.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    timeRemaining < 300 ? "text-destructive" : ""
                  }`}
                  data-testid="text-timer"
                >
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <Button
                onClick={() => setShowSubmitDialog(true)}
                variant="default"
                data-testid="button-submit-exam"
              >
                Submit Exam
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="border-b bg-background">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-4">
            <Progress value={progress} className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <Card className="mb-6">
            <CardContent className="p-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="secondary">
                      Question {currentQuestionIndex + 1}
                    </Badge>
                    {currentQuestion && (
                      <Badge variant="outline">{currentQuestion.points} point{currentQuestion.points !== 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                  <h2
                    className="text-xl font-medium leading-relaxed md:text-2xl"
                    data-testid={`text-question-${currentQuestionIndex}`}
                  >
                    {currentQuestion?.questionText}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleFlag(currentQuestionIndex)}
                  className={flaggedQuestions.has(currentQuestionIndex) ? "text-primary" : ""}
                  data-testid="button-flag-question"
                >
                  <Flag className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {currentQuestion?.questionType === "multiple-choice" && currentQuestion.options && (
                  <RadioGroup
                    value={answers[currentQuestion.id] || ""}
                    onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                  >
                    {currentQuestion.options.map((option, idx) => (
                      <div
                        key={idx}
                        className="flex items-center space-x-3 rounded-md border p-4 hover-elevate"
                      >
                        <RadioGroupItem
                          value={option}
                          id={`option-${idx}`}
                          data-testid={`radio-option-${idx}`}
                        />
                        <Label
                          htmlFor={`option-${idx}`}
                          className="flex-1 cursor-pointer text-lg font-normal"
                        >
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {currentQuestion?.questionType === "true-false" && (
                  <RadioGroup
                    value={answers[currentQuestion.id] || ""}
                    onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                  >
                    {["True", "False"].map((option) => (
                      <div
                        key={option}
                        className="flex items-center space-x-3 rounded-md border p-4 hover-elevate"
                      >
                        <RadioGroupItem
                          value={option}
                          id={`option-${option}`}
                          data-testid={`radio-${option.toLowerCase()}`}
                        />
                        <Label
                          htmlFor={`option-${option}`}
                          className="flex-1 cursor-pointer text-lg font-normal"
                        >
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {currentQuestion?.questionType === "short-answer" && (
                  <Textarea
                    placeholder="Type your answer here..."
                    value={answers[currentQuestion.id] || ""}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    className="min-h-32 text-base"
                    data-testid="textarea-answer"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => handleNavigate(currentQuestionIndex - 1)}
              disabled={currentQuestionIndex === 0}
              data-testid="button-previous"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => handleNavigate(currentQuestionIndex + 1)}
              disabled={currentQuestionIndex === questions.length - 1}
              className="flex-1"
              data-testid="button-next"
            >
              Next
            </Button>
          </div>

          {/* Question Navigator */}
          <Card className="mt-6">
            <CardContent className="p-6">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Question Navigator
              </h3>
              <div className="grid grid-cols-8 gap-2 md:grid-cols-10">
                {questions.map((q, idx) => (
                  <Button
                    key={idx}
                    variant={idx === currentQuestionIndex ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleNavigate(idx)}
                    className={`relative h-10 w-10 p-0 ${
                      answers[q.id]
                        ? "bg-green-500 text-white border-green-600"
                        : ""
                    }`}
                    data-testid={`button-nav-${idx}`}
                  >
                    {idx + 1}
                    {flaggedQuestions.has(idx) && (
                      <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-primary text-primary" />
                    )}
                  </Button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded border-2 border-primary" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded border" />
                  <span>Unanswered</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 fill-primary text-primary" />
                  <span>Flagged</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Submit Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Exam?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have answered {answeredCount} out of {questions.length} questions.
              </p>
              {answeredCount < questions.length && (
                <p className="text-destructive">
                  You have {questions.length - answeredCount} unanswered question(s).
                </p>
              )}
              <p>Once submitted, you cannot make any changes to your answers.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-submit">
              Review Answers
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => submitExamMutation.mutate()}
              disabled={submitExamMutation.isPending}
              data-testid="button-confirm-submit"
            >
              {submitExamMutation.isPending ? "Submitting..." : "Submit Exam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
