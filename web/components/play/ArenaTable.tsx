'use client';

import './playTheme.css';
import type { CardInstance, GameState, Player } from '../../lib/engine';
import { isCreature, isPlaneswalker } from '../../lib/engine';
import { CardTile } from './CardTile';
import { DropZone } from './DropZone';
import type { PlayDragPayload } from './dnd';

type Props = {
  state: GameState;
  youId: string;
  sourceLabel: string;
  highlightIds: Set<string>;
  highlightPlayers: Set<string>;
  highlightStackIds?: Set<string>;
  casting: boolean;
  onPass: () => void;
  onPlayerLifeClick?: (playerId: string) => void;
  onBattlefieldCard: (playerId: string, card: CardInstance) => void;
  onHandCard: (card: CardInstance) => void;
  onCommandCard: (card: CardInstance) => void;
  onGraveyardCard?: (card: CardInstance) => void;
  onStackObject?: (stackId: string) => void;
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

function PlayerHud({
  player,
  active,
  priority,
  highlight,
  onLife,
  dropActive,
  onDropPayload,
}: {
  player: Player;
  active: boolean;
  priority: boolean;
  highlight: boolean;
  onLife?: () => void;
  dropActive?: boolean;
  onDropPayload?: (p: PlayDragPayload) => void;
}) {
  const body = (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          {player.name}
          {active && (
            <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-[var(--pt-accent)]">
              active
            </span>
          )}
          {priority && (
            <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-[var(--pt-legal)]">
              priority
            </span>
          )}
          {player.hasLost && (
            <span className="ml-2 text-[0.65rem] text-[var(--pt-danger)]">lost</span>
          )}
        </div>
        <div className="text-[0.65rem] text-[var(--pt-muted)] truncate">
          lib {player.library.length} · gy {player.graveyard.length} · cmd{' '}
          {player.commandZone.map((c) => c.card.name).join(', ') || '—'}
          {player.citysBlessing ? ' · blessing' : ''}
        </div>
      </div>
      {onLife ? (
        <button
          type="button"
          onClick={onLife}
          className={`play-life px-2 py-0.5 rounded border ${
            highlight ? 'border-[var(--pt-accent)]' : 'border-[var(--pt-line)]'
          }`}
        >
          {player.life}
          {player.poison > 0 ? (
            <span className="ml-2 text-sm text-[var(--pt-danger)]">☠{player.poison}</span>
          ) : null}
        </button>
      ) : (
        <div className="play-life">{player.life}</div>
      )}
    </div>
  );

  if (dropActive && onDropPayload) {
    return (
      <DropZone
        className={`rounded ${highlight ? 'play-drop--legal' : ''}`}
        label={`Target ${player.name}`}
        onDropPayload={onDropPayload}
      >
        {body}
      </DropZone>
    );
  }
  return body;
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
  onPlayerLifeClick,
  onBattlefieldCard,
  onHandCard,
  onCommandCard,
  onGraveyardCard,
  onStackObject,
  promptSlot,
  choicesSlot,
}: Props) {
  const you = state.players.find((p) => p.id === youId) || state.players[0];
  const opponents = state.players.filter((p) => p.id !== you?.id);
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

  const mana =
    Object.entries(you.manaPool)
      .filter(([, n]) => n > 0)
      .map(([c, n]) => `${n}${c}`)
      .join(' ') || '—';

  const resolveCard = (payload: PlayDragPayload): CardInstance | undefined => {
    if (payload.src === 'hand') return you.hand.find((c) => c.id === payload.cardId);
    if (payload.src === 'command') return you.commandZone.find((c) => c.id === payload.cardId);
    if (payload.src === 'gy') return you.graveyard.find((c) => c.id === payload.cardId);
    const owner = state.players.find((p) => p.id === payload.playerId);
    return owner ? findCard(owner, payload.cardId) : undefined;
  };

  /** Drop onto your board: cast from hand/command, or GY flashback, or BF activate. */
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

  /** Drop onto opponent board / player: attack declare, cast target, or block. */
  const dropOnOpp = (
    oppId: string,
    payload: PlayDragPayload,
    asPlayerTarget?: boolean,
  ) => {
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
    // Casting: drop onto legal target
    if (casting && highlightIds.has(dest.id)) {
      onBattlefieldCard(ownerId, dest);
      return;
    }
    // Blockers: drag blocker onto attacker (or attacker onto blocker)
    if (declareBlk && payload.src === 'bf') {
      const dragged = resolveCard(payload);
      if (!dragged) return;
      // Prefer: blocker dropped on attacker → focus attacker then toggle blocker
      if (state.combat?.attackers.some((a) => a.attackerId === dest.id)) {
        onBattlefieldCard(ownerId, dest); // focus attacker
        onBattlefieldCard(payload.playerId, dragged); // toggle blocker
        return;
      }
      if (state.combat?.attackers.some((a) => a.attackerId === dragged.id)) {
        onBattlefieldCard(payload.playerId, dragged);
        onBattlefieldCard(ownerId, dest);
        return;
      }
    }
    // Attackers: drag your creature onto opp permanent (PW) or just toggle
    if (declareAtk && payload.src === 'bf' && payload.playerId === you.id) {
      const c = you.battlefield.find((x) => x.id === payload.cardId);
      if (c) onBattlefieldCard(you.id, c);
      if (isPlaneswalker(dest)) onBattlefieldCard(ownerId, dest);
      return;
    }
    if (payload.src === 'hand' || payload.src === 'command' || payload.src === 'gy') {
      dropOnYourBoard(payload);
      return;
    }
    const c = resolveCard(payload);
    if (c && payload.src === 'bf') onBattlefieldCard(payload.playerId, c);
  };

  const dropOnStack = (payload: PlayDragPayload) => {
    if (casting && payload.src === 'bf') {
      // ignored — stack objects are buttons
      return;
    }
    dropOnYourBoard(payload);
  };

  const handDraggable = !casting && priorityId === you.id;
  const bfDraggable = declareAtk || declareBlk || casting || priorityId === you.id;

  return (
    <div className="play-table">
      <header className="play-table__hud">
        <div className="text-sm">
          <span className="font-semibold tracking-wide">Commander</span>
          <span className="ml-2 text-[var(--pt-muted)] text-xs">
            T{state.turnNumber} · {state.phase}/{state.step} · {sourceLabel}
          </span>
          <span className="ml-2 text-[0.6rem] text-[var(--pt-muted)] hidden sm:inline">
            drag: hand→board · creature→attack/block · onto target
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--pt-muted)]">
          <span>mana {mana}</span>
          <span>lands {you.landsPlayedThisTurn}/1</span>
          <button
            type="button"
            disabled={!canPass}
            onClick={onPass}
            className="px-3 py-1.5 rounded border border-[var(--pt-line)] text-[var(--pt-ink)] disabled:opacity-40 hover:border-[var(--pt-accent)]"
          >
            Pass
          </button>
        </div>
      </header>

      {choicesSlot}
      {promptSlot}

      <div className="play-table__board">
        <div className="space-y-3 min-h-0 overflow-y-auto">
          {opponents.map((opp) => {
            const oppSplit = splitBf(opp);
            return (
              <div key={opp.id} className="space-y-1">
                <PlayerHud
                  player={opp}
                  active={activeId === opp.id}
                  priority={priorityId === opp.id}
                  highlight={highlightPlayers.has(opp.id)}
                  onLife={
                    onPlayerLifeClick && highlightPlayers.has(opp.id)
                      ? () => onPlayerLifeClick(opp.id)
                      : undefined
                  }
                  dropActive={declareAtk || (casting && highlightPlayers.has(opp.id))}
                  onDropPayload={(p) => dropOnOpp(opp.id, p, true)}
                />
                <DropZone
                  className="play-table__lane"
                  label={`${opp.name} permanents`}
                  active={declareAtk || declareBlk || casting}
                  onDropPayload={(p) => dropOnOpp(opp.id, p)}
                >
                  {oppSplit.other.map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      legal={highlightIds.has(c.id)}
                      onClick={() => onBattlefieldCard(opp.id, c)}
                      dragPayload={
                        bfDraggable
                          ? { src: 'bf', playerId: opp.id, cardId: c.id }
                          : undefined
                      }
                      dropTarget={declareBlk || (casting && highlightIds.has(c.id))}
                      onDropPayload={(p) => dropOnPermanent(opp.id, c, p)}
                    />
                  ))}
                  {oppSplit.other.length === 0 && (
                    <span className="text-xs text-[var(--pt-muted)] px-1">no permanents</span>
                  )}
                </DropZone>
                <div
                  className="play-table__lane play-table__lane--lands"
                  aria-label={`${opp.name} lands`}
                >
                  {oppSplit.lands.map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      legal={highlightIds.has(c.id)}
                      onClick={() => onBattlefieldCard(opp.id, c)}
                      dropTarget={casting && highlightIds.has(c.id)}
                      onDropPayload={(p) => dropOnPermanent(opp.id, c, p)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DropZone
          className="play-table__stack"
          label="Stack"
          active={casting || handDraggable}
          onDropPayload={dropOnStack}
        >
          {state.stack.length === 0 ? (
            <span>stack empty · drop to cast</span>
          ) : (
            <div className="play-stack-row">
              {[...state.stack].reverse().map((s, idx) => {
                const lit = !!highlightStackIds?.has(s.id);
                const top = idx === 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!(lit && onStackObject)}
                    onClick={lit && onStackObject ? () => onStackObject(s.id) : undefined}
                    className={[
                      'play-stack-card',
                      lit ? 'play-stack-card--legal' : '',
                      top ? 'play-stack-card--top' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={`${s.kind}: ${s.name}`}
                  >
                    <div className="play-stack-card__kind">{s.kind}</div>
                    <div className="play-stack-card__name">{s.name}</div>
                  </button>
                );
              })}
            </div>
          )}
          {state.monarchPlayerId && (
            <span className="ml-3 text-[var(--pt-accent)] text-[0.65rem]">
              monarch: {state.monarchPlayerId}
            </span>
          )}
        </DropZone>

        <div className="space-y-1 min-h-0">
          <DropZone
            className="play-table__lane play-table__lane--lands"
            label="Your lands / command"
            active={handDraggable || !!onGraveyardCard}
            onDropPayload={dropOnYourBoard}
          >
            {youSplit.lands.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                legal={highlightIds.has(c.id)}
                onClick={() => onBattlefieldCard(you.id, c)}
                dragPayload={
                  bfDraggable ? { src: 'bf', playerId: you.id, cardId: c.id } : undefined
                }
                dropTarget={casting && highlightIds.has(c.id)}
                onDropPayload={(p) => dropOnPermanent(you.id, c, p)}
              />
            ))}
            {you.commandZone.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                onClick={!casting ? () => onCommandCard(c) : undefined}
                dragPayload={!casting ? { src: 'command', cardId: c.id } : undefined}
              />
            ))}
          </DropZone>
          <DropZone
            className="play-table__lane"
            label="Your permanents"
            active={handDraggable || declareAtk || declareBlk || casting}
            onDropPayload={dropOnYourBoard}
          >
            {youSplit.other.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                legal={highlightIds.has(c.id)}
                focus={state.combat?.focusAttackerId === c.id}
                onClick={() => onBattlefieldCard(you.id, c)}
                dragPayload={
                  bfDraggable ? { src: 'bf', playerId: you.id, cardId: c.id } : undefined
                }
                dropTarget={declareBlk || (casting && highlightIds.has(c.id))}
                onDropPayload={(p) => dropOnPermanent(you.id, c, p)}
              />
            ))}
            {youSplit.other.length === 0 && (
              <span className="text-xs text-[var(--pt-muted)] px-1">
                battlefield · drop hand here
              </span>
            )}
          </DropZone>
          <PlayerHud
            player={you}
            active={activeId === you.id}
            priority={priorityId === you.id}
            highlight={highlightPlayers.has(you.id)}
            onLife={
              onPlayerLifeClick && highlightPlayers.has(you.id)
                ? () => onPlayerLifeClick(you.id)
                : undefined
            }
            dropActive={casting && highlightPlayers.has(you.id)}
            onDropPayload={() => {
              if (onPlayerLifeClick) onPlayerLifeClick(you.id);
            }}
          />
        </div>
      </div>

      <div className="play-table__hand" aria-label="Hand">
        {you.hand.map((c) => (
          <CardTile
            key={c.id}
            card={c}
            onClick={!casting ? () => onHandCard(c) : undefined}
            dragPayload={handDraggable ? { src: 'hand', cardId: c.id } : undefined}
          />
        ))}
        {you.hand.length === 0 && (
          <span className="text-xs text-[var(--pt-muted)] self-center">hand empty</span>
        )}
        {you.graveyard.length > 0 && onGraveyardCard && (
          <div className="ml-4 flex items-end gap-1 border-l border-[var(--pt-line)] pl-3">
            <span className="text-[0.6rem] uppercase tracking-wide text-[var(--pt-muted)] self-center">
              gy
            </span>
            {you.graveyard.slice(-3).map((c) => (
              <CardTile
                key={c.id}
                card={c}
                onClick={() => onGraveyardCard(c)}
                dragPayload={{ src: 'gy', cardId: c.id }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
