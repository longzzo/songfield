/* engine.js(브라우저/서버 공용 CommonJS)의 서버측 타입 선언.
   실제 구현은 ../engine.js, 번들은 wrangler(esbuild)가 처리. */
declare module "*/engine.js" {
  export class GameEngine {
    state: any;
    pendingDefense: any;
    subscribe(fn: () => void): () => void;
    newGame(roster: Array<{ id: string; nickname: string; isBot: boolean; aiType?: string }>): void;
    getParticipant(id: string): any;
    livingParticipants(): any[];
    finalRanking(): Array<{ rank: number; participant: any }>;
    isActorTurn(actorId: string): boolean;
    playCard(actorId: string, instanceId: string): void;
    selectTarget(actorId: string, targetId: string): void;
    cancelTarget(actorId: string): void;
    useImprint(actorId: string, cardId: string): void;
    releaseImprint(actorId: string, cardId: string): void;
    pray(actorId: string): void;
    startOffer(actorId: string): void;
    cancelOffer(actorId: string): void;
    skipTurn(actorId: string): void;
    playerTimeout(actorId: string): void;
    chooseDefense(actorId: string, instanceId: string): void;
    forgive(actorId: string): void;
    submitChoice(actorId: string, instanceId: string): void;
    submitForcedSale(actorId: string, sellInstanceId: string): void;
    submitReplace(actorId: string, replaceInstanceId: string): void;
    submitRedistribute(actorId: string, hp: number, mp: number, gp: number): boolean;
    cancelRedistribute(actorId: string): void;
    [key: string]: any;
  }
  export const AI_TYPES: string[];
}
