'use client';

import { useEffect, useRef } from 'react';
import './playTheme.css';
import type { CardInstance, GameState, Player, StopKey } from '../../lib/engine';
import { getClock, isBattle, isCreature, isPlaneswalker, primaryPrompt } from '../../lib/engine';
import { scryfallImageUrl } from '../../lib/cardArt';
import { CardTile } from './CardTile';
import { CombatArrowOverlay } from './CombatArrowOverlay';
import { combatRoleForCard, isDefendPlayerHighlighted } from './combatArrowModel';
import { DropZone } from './DropZone';
import { PhaseRail } from './PhaseRail';
import { ManaGems } from './ManaGems';
import { SpellTargetOverlay } from './SpellTargetOverlay';
import { encodePlayDrag, PLAY_DND_MIME, type PlayDragPayload } from './dnd';

type Props = {
  state: GameState;
  youId: string;
  sourceLabel: string;
  highlightIds: Set<string>;
  highlightPlayers: Set<string>;
  highlightStackIds?: Set<string>;
  casting: boolean;
  onPass: () => void;
  /** Arena PromptController chrome (optional — falls back to Pass only). */
  clockControls?: {
    onToggleStop: (key: StopKey) => void;
    onToggleFullControl: () => void;
    onArmHold: () => void;
    onPassTurn: (mode: 'untilResponse' | 'unconditional' | 'off') => void;
    onPrimary: () => void;
  };
  onPlayerLifeClick?: (playerId: string) => void;
  onBattlefieldCard: (playerId: string, card: CardInstance) => void;
  onHandCard: (card: CardInstance) => void;
  onCommandCard: (card: CardInstance) => void;
  onGraveyardCard?: (card: CardInstance) => void;
  onStackObject?: (stackId: string) => void;
  /** Arena: drag blocker onto attacker (add / reorder to end). */
  onBlockerDropOnAttacker?: (attackerId: string, blockerId: string) => void;
  /** Arena: drag attacker onto face / PW. */
  onAttackerDropOnDefend?: (
    attackerId: string,
    target: {
      playerId: string;
      planeswalkerId?: string | null;
      battleId?: string | null;
    },
  ) => void;
  promptSlot?: React.ReactNode;
  choicesSlot?: React.ReactNode;
};

function splitBf(player: Player) {
  const lands: CardInstance[] = [];
  const other: CardInstance[] = [];
  for (const c of player.battlefield) {
    if (c.card.type_line.includes('Land') && !isCreature(c) && !isPlaneswalker(c)) {
      lands.push(c);
    } else {
      other.push(c);
    }
  }
  return { lands, other };
}

function findCard(player: Player, cardId: string): CardInstance | undefined {
  return (
    player.battlefield.find((c) => c.id === cardId) ||
    player.hand.find((c) => c.id === cardId) ||
    player.commandZone.find((c) => c.id === cardId) ||
    player.graveyard.find((c) => c.id === cardId)
  );
}

function findCardAnywhere(state: GameState, cardId: string): string | undefined {
  for (const p of state.players) {
    const c = findCard(p, cardId);
    if (c) return c.card.name;
  }
  return undefined;
}

function SeatHud({
  player,
  active,
  priority,
  highlight,
  defendTarget,
  onLife,
  dropActive,
  onDropPayload,
  you,
}: {
  player: Player;
  active: boolean;
  priority: boolean;
  highlight: boolean;
  /** Combat: this seat is the current attack destination (player). */
  defendTarget?: boolean;
  onLife?: () => void;
  dropActive?: boolean;
  onDropPayload?: (p: PlayDragPayload) => void;
  you?: boolean;
}) {
  const lifeClass = [
    'play-life',
    onLife ? 'play-life--btn' : '',
    highlight ? 'play-life--lit' : '',
    defendTarget ? 'play-life--defend' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lifeInner = (
    <>
      <span className="play-life__num">{player.life}</span>
      <span className="play-life__label">LIFE</span>
      {player.poison > 0 ? <span className="play-life__poison">☠{player.poison}</span> : null}
    </>
  );
  const life = onLife ? (
    <button
      type="button"
      onClick={onLife}
      data-player-id={player.id}
      className={lifeClass}
    >
      {lifeInner}
    </button>
  ) : (
    <div data-player-id={player.id} className={lifeClass}>
      {lifeInner}
    </div>
  );

  const body = (
    <div
      className={`play-seat__hud ${you ? 'play-seat__hud--you' : ''} ${
        defendTarget ? 'play-seat__hud--defend' : ''
      }`}
    >
      {you ? null : life}
      <div className="play-seat__identity">
        <div className="play-seat__name">
          {player.name}
          <span className="play-seat__badges">
            {active && <span className="play-seat__badge">turn</span>}
            {priority && <span className="play-seat__badge play-seat__badge--prio">prio</span>}
            {defendTarget && <span className="play-seat__badge play-seat__badge--defend">defend</span>}
            {player.hasLost && (
              <span className="play-seat__badge play-seat__badge--lost">lost</span>
            )}
          </span>
        </div>
        <div className="play-seat__meta">
          {player.library.length} lib
          {player.citysBlessing ? ' · blessing' : ''}
        </div>
      </div>
      {you ? life : null}
    </div>
  );

  if (dropActive && onDropPayload) {
    return (
      <DropZone className="" label={`${player.name} (player)`} active onDropPayload={onDropPayload}>
        {body}
      </DropZone>
    );
  }
  return body;
}

function SeatBoard({
  player,
  you,
  split,
  highlightIds,
  casting,
  declareAtk,
  declareBlk,
  bfDraggable,
  handDraggable,
  focusAttackerId,
  combat,
  onBattlefieldCard,
  onGraveyardCard,
  dropOnBoard,
  dropOnPermanent,
  compact,
}: {
  player: Player;
  you: boolean;
  split: { lands: CardInstance[]; other: CardInstance[] };
  highlightIds: Set<string>;
  casting: boolean;
  declareAtk: boolean;
  declareBlk: boolean;
  bfDraggable: boolean;
  handDraggable: boolean;
  focusAttackerId?: string | null;
  combat: GameState['combat'];
  onBattlefieldCard: (playerId: string, card: CardInstance) => void;
  onGraveyardCard?: (card: CardInstance) => void;
  dropOnBoard: (p: PlayDragPayload) => void;
  dropOnPermanent: (ownerId: string, dest: CardInstance, p: PlayDragPayload) => void;
  compact?: boolean;
}) {
  const size = compact ? 'sm' : 'md';
  const permLane = (
    <DropZone
      className={`play-table__lane play-table__lane--perm ${
        split.other.length === 0 ? 'play-table__lane--empty' : ''
      }`}
      label={you ? 'Your permanents' : `${player.name} permanents`}
      active={declareAtk || declareBlk || casting || (you && handDraggable)}
      onDropPayload={dropOnBoard}
      emptyHint={
        split.other.length === 0
          ? you
            ? 'battlefield · drop hand here'
            : 'no permanents'
          : undefined
      }
    >
      {split.other.map((c) => (
        <CardTile
          key={c.id}
          card={c}
          size={size}
          legal={highlightIds.has(c.id)}
          focus={focusAttackerId === c.id}
          combatRole={combatRoleForCard(combat, c.id)}
          onClick={() => onBattlefieldCard(player.id, c)}
          dragPayload={
            bfDraggable ? { src: 'bf', playerId: player.id, cardId: c.id } : undefined
          }
          dropTarget={declareBlk || (casting && highlightIds.has(c.id))}
          onDropPayload={(p) => dropOnPermanent(player.id, c, p)}
        />
      ))}
    </DropZone>
  );

  const landLane = (
    <DropZone
      className="play-table__lane play-table__lane--lands"
      label={you ? 'Your lands' : `${player.name} lands`}
      active={you && (handDraggable || !!onGraveyardCard)}
      onDropPayload={you ? dropOnBoard : () => undefined}
    >
      {split.lands.map((c) => (
        <CardTile
          key={c.id}
          card={c}
          size={size}
          legal={highlightIds.has(c.id)}
          onClick={() => onBattlefieldCard(player.id, c)}
          dragPayload={
            you && bfDraggable
              ? { src: 'bf', playerId: player.id, cardId: c.id }
              : undefined
          }
          dropTarget={casting && highlightIds.has(c.id)}
          onDropPayload={(p) => dropOnPermanent(player.id, c, p)}
        />
      ))}
    </DropZone>
  );

  /* Arena: opp lands near mid, permanents farther; you: permanents mid, lands near hand */
  if (you) {
    return (
      <>
        {permLane}
        {landLane}
      </>
    );
  }
  return (
    <>
      {landLane}
      {permLane}
    </>
  );
}

export function ArenaTable({
  state,
  youId,
  sourceLabel,
  highlightIds,
  highlightPlayers,
  highlightStackIds,
  casting,
  onPass,
  clockControls,
  onPlayerLifeClick,
  onBattlefieldCard,
  onHandCard,
  onCommandCard,
  onGraveyardCard,
  onStackObject,
  onBlockerDropOnAttacker,
  onAttackerDropOnDefend,
  promptSlot,
  choicesSlot,
}: Props) {
  const you = state.players.find((p) => p.id === youId) || state.players[0];
  const opponents = state.players.filter((p) => p.id !== you?.id);
  const feltRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clockControls) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const mode = getClock(state, youId).passTurnMode;
        clockControls.onPassTurn(mode === 'untilResponse' ? 'off' : 'untilResponse');
        return;
      }
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        clockControls.onPrimary();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clockControls, state, youId]);

  if (!you || opponents.length === 0) return null;

  const youSplit = splitBf(you);
  const priorityId = state.players[state.priorityPlayerIndex]?.id;
  const activeId = state.players[state.activePlayerIndex]?.id;
  const declareAtk = state.combat?.mode === 'declareAttackers';
  const declareBlk = state.combat?.mode === 'declareBlockers';
  const canPass =
    !casting &&
    state.pendingChoices.length === 0 &&
    !declareAtk &&
    !declareBlk &&
    priorityId === you.id;

  const manaPoolEntries = Object.entries(you.manaPool).filter(([, n]) => n > 0);

  const resolveCard = (payload: PlayDragPayload): CardInstance | undefined => {
    if (payload.src === 'hand') return you.hand.find((c) => c.id === payload.cardId);
    if (payload.src === 'command') return you.commandZone.find((c) => c.id === payload.cardId);
    if (payload.src === 'gy') return you.graveyard.find((c) => c.id === payload.cardId);
    const owner = state.players.find((p) => p.id === payload.playerId);
    return owner ? findCard(owner, payload.cardId) : undefined;
  };

  const dropOnYourBoard = (payload: PlayDragPayload) => {
    if (payload.src === 'hand') {
      const c = you.hand.find((x) => x.id === payload.cardId);
      if (c) onHandCard(c);
      return;
    }
    if (payload.src === 'command') {
      const c = you.commandZone.find((x) => x.id === payload.cardId);
      if (c) onCommandCard(c);
      return;
    }
    if (payload.src === 'gy' && onGraveyardCard) {
      const c = you.graveyard.find((x) => x.id === payload.cardId);
      if (c) onGraveyardCard(c);
      return;
    }
    if (payload.src === 'bf') {
      const c = resolveCard(payload);
      if (c) onBattlefieldCard(payload.playerId, c);
    }
  };

  const dropOnOpp = (
    oppId: string,
    payload: PlayDragPayload,
    asPlayerTarget?: boolean,
  ) => {
    if (asPlayerTarget && declareAtk && payload.src === 'bf' && payload.playerId === you.id) {
      if (onAttackerDropOnDefend) {
        onAttackerDropOnDefend(payload.cardId, { playerId: oppId });
      } else {
        onPlayerLifeClick?.(oppId);
        const c = you.battlefield.find((x) => x.id === payload.cardId);
        if (c) onBattlefieldCard(you.id, c);
      }
      return;
    }
    if (asPlayerTarget && casting && onPlayerLifeClick && highlightPlayers.has(oppId)) {
      onPlayerLifeClick(oppId);
      return;
    }
    if (payload.src === 'bf' && payload.playerId === you.id) {
      const c = you.battlefield.find((x) => x.id === payload.cardId);
      if (c) onBattlefieldCard(you.id, c);
      return;
    }
    if (payload.src === 'hand' || payload.src === 'command') {
      dropOnYourBoard(payload);
    }
  };

  const dropOnPermanent = (ownerId: string, dest: CardInstance, payload: PlayDragPayload) => {
    if (casting && highlightIds.has(dest.id)) {
      onBattlefieldCard(ownerId, dest);
      return;
    }
    if (declareBlk && payload.src === 'bf') {
      const dragged = resolveCard(payload);
      if (!dragged) return;
      if (state.combat?.attackers.some((a) => a.attackerId === dest.id)) {
        if (onBlockerDropOnAttacker) onBlockerDropOnAttacker(dest.id, dragged.id);
        else {
          onBattlefieldCard(ownerId, dest);
          onBattlefieldCard(payload.playerId, dragged);
        }
        return;
      }
      if (state.combat?.attackers.some((a) => a.attackerId === dragged.id)) {
        if (onBlockerDropOnAttacker) onBlockerDropOnAttacker(dragged.id, dest.id);
        else {
          onBattlefieldCard(payload.playerId, dragged);
          onBattlefieldCard(ownerId, dest);
        }
        return;
      }
    }
    if (declareAtk && payload.src === 'bf' && payload.playerId === you.id) {
      const attacker = resolveCard(payload);
      if (!attacker) return;
      if (isPlaneswalker(dest) && onAttackerDropOnDefend) {
        onAttackerDropOnDefend(attacker.id, {
          playerId: ownerId,
          planeswalkerId: dest.id,
        });
        return;
      }
      if (isBattle(dest) && onAttackerDropOnDefend) {
        onAttackerDropOnDefend(attacker.id, {
          playerId: dest.protectorPlayerId || ownerId,
          battleId: dest.id,
        });
        return;
      }
      onBattlefieldCard(payload.playerId, attacker);
      return;
    }
    if (payload.src === 'hand' || payload.src === 'command' || payload.src === 'gy') {
      dropOnYourBoard(payload);
      return;
    }
    const c = resolveCard(payload);
    if (c && payload.src === 'bf') onBattlefieldCard(payload.playerId, c);
  };

  /** Arena: spells/permanents drop onto the stack column to begin cast. */
  const dropOnStack = (payload: PlayDragPayload) => {
    if (payload.src === 'hand') {
      const c = you.hand.find((x) => x.id === payload.cardId);
      if (!c) return;
      // Lands belong on the felt — still play them if dropped here
      onHandCard(c);
      return;
    }
    if (payload.src === 'command') {
      const c = you.commandZone.find((x) => x.id === payload.cardId);
      if (c) onCommandCard(c);
      return;
    }
    if (payload.src === 'gy' && onGraveyardCard) {
      const c = you.graveyard.find((x) => x.id === payload.cardId);
      if (c) onGraveyardCard(c);
    }
  };

  const declaringCombat =
    declareAtk || declareBlk || state.combat?.mode === 'assignDamage';
  /** Arena: cast/land from hand only with priority, outside declare/assign.
   * Exception: additional-cost discard picks while casting. */
  const pickingCostDiscard = state.pendingCast?.phase === 'additionalCost';
  const canPlayFromHand =
    pickingCostDiscard || (!casting && !declaringCombat && priorityId === you.id);
  const handDraggable = canPlayFromHand && !pickingCostDiscard;
  const bfDraggable = declareAtk || declareBlk || casting || priorityId === you.id;
  const prompt = primaryPrompt(state, youId);

  const primaryOpp = opponents[0];
  const sideOpps = opponents.slice(1);
  const multi = sideOpps.length > 0;
  const primarySplit = splitBf(primaryOpp);

  const renderSeatHud = (p: Player, isYou: boolean) => (
    <SeatHud
      player={p}
      you={isYou}
      active={activeId === p.id}
      priority={priorityId === p.id}
      highlight={highlightPlayers.has(p.id)}
      defendTarget={isDefendPlayerHighlighted(state.combat, p.id)}
      onLife={
        onPlayerLifeClick && highlightPlayers.has(p.id)
          ? () => onPlayerLifeClick(p.id)
          : undefined
      }
      dropActive={
        isYou
          ? casting && highlightPlayers.has(p.id)
          : declareAtk || (casting && highlightPlayers.has(p.id))
      }
      onDropPayload={
        isYou
          ? () => {
              if (onPlayerLifeClick) onPlayerLifeClick(p.id);
            }
          : (pay) => dropOnOpp(p.id, pay, true)
      }
    />
  );

  const seatBoardProps = {
    highlightIds,
    casting,
    declareAtk,
    declareBlk,
    bfDraggable,
    handDraggable,
    focusAttackerId: state.combat?.focusAttackerId,
    combat: state.combat,
    onBattlefieldCard,
    dropOnPermanent,
  };

  return (
    <div className="play-table" ref={tableRef}>
      <SpellTargetOverlay
        tableRef={tableRef}
        state={state}
        legalPermanentIds={state.pendingCast ? highlightIds : undefined}
        legalPlayerIds={state.pendingCast ? highlightPlayers : undefined}
      />
      <div className="play-table__top">
        <div className="play-table__brand">
          <strong>Tablebound</strong>
        </div>
        <div className="play-table__status">
          Round {state.turnNumber}
          {activeId === you.id ? ' · Your Turn' : ` · ${sourceLabel}`}
          {manaPoolEntries.length > 0 && (
            <span className="play-table__status-mana">
              <ManaGems pool={you.manaPool} />
            </span>
          )}
        </div>
        <div className="play-table__top-spacer" aria-hidden />
      </div>

      <div className="play-table__stage">
        <div
          ref={feltRef}
          className={`play-table__felt ${multi ? 'play-table__felt--multi' : ''} ${
            declareAtk ||
            declareBlk ||
            state.combat?.mode === 'assignDamage' ||
            (state.combat?.mode === 'idle' && (state.combat.attackers?.length || 0) > 0)
              ? 'play-table__felt--combat'
              : ''
          }`}
        >
          <CombatArrowOverlay feltRef={feltRef} state={state} />

          {multi && (
            <div className="play-table__side-opps">
              {sideOpps.map((opp) => {
                const split = splitBf(opp);
                const defend = isDefendPlayerHighlighted(state.combat, opp.id);
                return (
                  <div
                    key={opp.id}
                    className={`play-seat play-seat--side ${
                      defend ? 'play-seat--defend-lane' : ''
                    }`}
                  >
                    {renderSeatHud(opp, false)}
                    <SeatBoard
                      {...seatBoardProps}
                      player={opp}
                      you={false}
                      split={split}
                      dropOnBoard={(p) => dropOnOpp(opp.id, p)}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={`play-seat play-seat--opp min-h-0 ${
              isDefendPlayerHighlighted(state.combat, primaryOpp.id)
                ? 'play-seat--defend-lane'
                : ''
            }`}
          >
            {renderSeatHud(primaryOpp, false)}
            <div className="play-seat__opp-hand" aria-label={`${primaryOpp.name} hand`}>
              {primaryOpp.hand.length === 0 ? (
                <span className="play-seat__opp-hand-empty">hand empty</span>
              ) : (
                Array.from({ length: Math.min(primaryOpp.hand.length, 12) }).map((_, i, arr) => {
                  const mid = (arr.length - 1) / 2;
                  const rot = (i - mid) * 3.2;
                  return (
                    <div
                      key={i}
                      className="play-card-back"
                      title="Hidden"
                      style={{
                        transform: `rotate(${rot}deg)`,
                        zIndex: i,
                        marginLeft: i === 0 ? 0 : '-0.55rem',
                      }}
                    />
                  );
                })
              )}
              {primaryOpp.hand.length > 12 && (
                <span className="play-seat__opp-hand-more">+{primaryOpp.hand.length - 12}</span>
              )}
            </div>
            <SeatBoard
              {...seatBoardProps}
              player={primaryOpp}
              you={false}
              split={primarySplit}
              dropOnBoard={(p) => dropOnOpp(primaryOpp.id, p)}
            />
          </div>

          <DropZone
            className={`play-seat play-seat--you min-h-0 ${
              isDefendPlayerHighlighted(state.combat, you.id) ? 'play-seat--defend-lane' : ''
            }`}
            label="Your battlefield"
            active={handDraggable || !!onGraveyardCard}
            acceptSrc={['hand', 'command', 'gy']}
            onDropPayload={dropOnYourBoard}
          >
            <SeatBoard
              {...seatBoardProps}
              player={you}
              you
              split={youSplit}
              onGraveyardCard={onGraveyardCard}
              dropOnBoard={dropOnYourBoard}
            />
            {renderSeatHud(you, true)}
          </DropZone>

          {(choicesSlot || promptSlot) && (
            <div className="play-table__overlays">
              {choicesSlot}
              {promptSlot}
            </div>
          )}
        </div>

        <DropZone
          className="play-table__stack-col"
          label="Stack"
          active={casting || handDraggable}
          onDropPayload={dropOnStack}
        >
          <div className="play-table__stack-label">Stack</div>
          {state.stack.length === 0 ? (
            <div className="play-table__stack-empty">empty · drop to cast</div>
          ) : (
            <div className="play-stack-col-list">
              {[...state.stack].map((s, idx, arr) => {
                const lit = !!highlightStackIds?.has(s.id);
                const top = idx === arr.length - 1;
                const art =
                  s.cardInstance?.card.image_uri ||
                  (s.cardInstance && !s.cardInstance.faceDown
                    ? scryfallImageUrl(s.cardInstance.card.name, 'normal')
                    : null);
                const stackIdx = idx + 1;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-stack-id={s.id}
                    disabled={!(lit && onStackObject)}
                    onClick={lit && onStackObject ? () => onStackObject(s.id) : undefined}
                    className={[
                      'play-stack-card',
                      lit ? 'play-stack-card--legal' : '',
                      top ? 'play-stack-card--top' : '',
                      art ? 'play-stack-card--art' : '',
                      `play-stack-card--${s.kind}`,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={`${s.kind}: ${s.name}`}
                    style={
                      art
                        ? {
                            backgroundImage: `linear-gradient(to top, rgba(8,12,10,.88) 0%, rgba(8,12,10,.25) 50%, transparent 72%), url(${art})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center top',
                          }
                        : undefined
                    }
                  >
                    <div className="play-stack-card__kind">{s.kind}</div>
                    <div className="play-stack-card__name">{s.name}</div>
                    {s.targets && Object.keys(s.targets).length > 0 && (
                      <div className="play-stack-card__targets">
                        →{' '}
                        {Object.values(s.targets)
                          .map((t) =>
                            t.kind === 'player'
                              ? state.players.find((p) => p.id === t.playerId)?.name || 'player'
                              : t.kind === 'permanent'
                                ? findCardAnywhere(state, t.permanentId) || 'perm'
                                : t.kind === 'stack'
                                  ? 'stack'
                                  : '?',
                          )
                          .join(', ')}
                      </div>
                    )}
                    <span className="play-stack-card__idx">{stackIdx}</span>
                  </button>
                );
              })}
            </div>
          )}
          {state.monarchPlayerId && (
            <div className="play-table__monarch">monarch · {state.monarchPlayerId}</div>
          )}
        </DropZone>
      </div>

      <div className="play-table__footer">
        <div className="play-table__footer-main">
          <div className="play-table__chrome">
            {clockControls ? (
              <PhaseRail
                state={state}
                youId={youId}
                hidePrimary
                onToggleStop={clockControls.onToggleStop}
                onToggleFullControl={clockControls.onToggleFullControl}
                onArmHold={clockControls.onArmHold}
                onPassTurn={clockControls.onPassTurn}
                onPrimary={clockControls.onPrimary}
              />
            ) : (
              <div className="phase-rail">
                <span className="phase-rail__step">
                  {state.phase}/{state.step}
                </span>
              </div>
            )}
          </div>

          <div className="play-table__hand" aria-label="Hand">
            {you.hand.map((c, i, arr) => {
              const mid = (arr.length - 1) / 2;
              const rot = (i - mid) * 4.2;
              const lift = Math.abs(i - mid) * 2.5;
              return (
                <div
                  key={c.id}
                  className={`play-hand-slot ${handDraggable ? 'play-hand-slot--drag' : ''}`}
                  style={{
                    transform: `rotate(${rot}deg) translateY(${lift}px)`,
                    zIndex: i + 1,
                    marginLeft: i === 0 ? 0 : '-0.95rem',
                  }}
                  draggable={handDraggable}
                  onDragStart={
                    handDraggable
                      ? (e) => {
                          const raw = encodePlayDrag({ src: 'hand', cardId: c.id });
                          e.dataTransfer.setData(PLAY_DND_MIME, raw);
                          e.dataTransfer.setData('text/plain', raw);
                          e.dataTransfer.effectAllowed = 'move';
                          e.currentTarget.classList.add('play-hand-slot--dragging');
                        }
                      : undefined
                  }
                  onDragEnd={(e) =>
                    e.currentTarget.classList.remove('play-hand-slot--dragging')
                  }
                >
                  <CardTile
                    card={c}
                    size="hand"
                    onClick={canPlayFromHand ? () => onHandCard(c) : undefined}
                    /* Drag lives on the slot — nested button/div drag is unreliable */
                  />
                </div>
              );
            })}
            {you.hand.length === 0 && (
              <span className="text-xs text-[var(--pt-muted)] self-center">hand empty</span>
            )}
            {you.graveyard.length > 0 && onGraveyardCard && (
              <div className="play-table__gy">
                <span className="play-table__gy-label">gy</span>
                {you.graveyard.slice(-3).map((c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    size="sm"
                    onClick={() => onGraveyardCard(c)}
                    dragPayload={{ src: 'gy', cardId: c.id }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="play-table__cmd-pass">
          <div className="play-table__cmd" aria-label="Command zone">
            <span className="play-table__cmd-label">Commander</span>
            {you.commandZone.length === 0 ? (
              <span className="play-table__cmd-empty">—</span>
            ) : (
              you.commandZone.map((c) => (
                <CardTile
                  key={c.id}
                  card={c}
                  size="hand"
                  onClick={canPlayFromHand ? () => onCommandCard(c) : undefined}
                  dragPayload={
                    canPlayFromHand ? { src: 'command', cardId: c.id } : undefined
                  }
                />
              ))
            )}
          </div>
          {clockControls ? (
            <button
              type="button"
              className="phase-rail__primary play-table__pass"
              disabled={!prompt.enabled}
              onClick={clockControls.onPrimary}
            >
              {prompt.label}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canPass}
              onClick={onPass}
              className="phase-rail__primary play-table__pass"
            >
              Pass
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
