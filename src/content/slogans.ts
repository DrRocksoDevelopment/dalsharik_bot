export interface SloganContext {
  isCorrect: boolean;
  playersCount: number;
  accuracy: number;
  fastestCorrectMs: number | null;
  difficulty: number;
}

export type SloganKey =
  | 'correct'
  | 'wrong'
  | 'close'
  | 'hard'
  | 'easy'
  | 'fast'
  | 'many_players'
  | 'few_players';

const DEFAULT_SLOGANS: Record<SloganKey, string[]> = {
  correct: ['«Ну и кто бы мог подумать?»', '«Вот что было дальше.»'],
  wrong: ['«История решила иначе.»', '«История нанесла ответный удар.»', '«Неплохо. Но нет.»'],
  close: ['«А ты ставил не туда.»', '«Ты почти угадал.»'],
  hard: ['«История не согласна.»', '«А вот и поворот.»'],
  easy: ['«Вот что было дальше.»'],
  fast: ['«Реакция — огонь.»'],
  many_players: ['«Целая толпа решилась.»'],
  few_players: ['«Один в поле воин.»'],
};

export interface SloganProvider {
  get(context: SloganContext): string;
}

export class SloganEngine implements SloganProvider {
  constructor(private readonly sets: Record<SloganKey, string[]> = DEFAULT_SLOGANS) {}

  get(context: SloganContext): string {
    const candidates = this.pickCandidates(context);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? this.sets.wrong[0]!;
  }

  private pickCandidates(context: SloganContext): string[] {
    const acc = context.accuracy;
    if (acc >= 0.9) return this.sets.correct;
    if (acc >= 0.6) return this.sets.close;
    if (acc < 0.3) return this.sets.hard;
    if (context.playersCount < 3) return this.sets.few_players;
    if (context.playersCount > 15) return this.sets.many_players;
    return this.sets.wrong;
  }
}
