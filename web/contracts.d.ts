export type Action = 'context' | 'explain' | 'glossary';
export interface Slide {
  number: number;
  title: string;
  text: string;
  transcript: string;
  pdfPage: number;
}
export interface Lecture { id: string; title: string; pdfUrl: string | null; slides: Slide[] }
export interface ActionRequest { action: Action; slideNumber: number; transcriptThroughSlide?: number }
export interface Source { id: string; kind: 'slide' | 'transcript'; slideNumber: number; text: string }
export interface Answer {
  lectureId: string;
  slideNumber: number;
  action: Action;
  transcriptThroughSlide: number;
  status: 'ok' | 'insufficient_context';
  summary: string;
  points: { text: string; sourceIds: string[] }[];
  terms: { term: string; definition: string; sourceIds: string[] }[];
  missingContext: string[];
  sources: Source[];
}
export interface LectureState {
  lecture: Lecture | null;
  slideNumber: number;
  includeCurrentTranscript: boolean;
  loading: boolean;
  pendingAction: Action | null;
  panels: Record<Action, Answer | null>;
  error: string | null;
}
