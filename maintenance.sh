#!/bin/sh

# Filnamn
LIVE="public/index.html"
MAINTENANCE="public/index_maintenance.html"
BACKUP="public/index1.html"
LOGFILE="logs/maintenance-tentplan.log"
NOTIFY_URL="http://localhost:3007/notify"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"
}

notify() {
  SUBJECT="$1"
  MESSAGE="$2"

  curl -s -X POST "$NOTIFY_URL" \
    -H "Content-Type: application/json" \
    -d "{\"subject\": \"$SUBJECT\", \"message\": \"$MESSAGE\"}" > /dev/null

  log "Notis skickad – $SUBJECT"
}

confirm() {
  echo -n "$1 (j/n): "
  read svar
  if [ "$svar" != "j" ]; then
    echo "Åtgärden avbröts."
    log "Användaren avbröt åtgärden."
    exit 0
  fi
}

case "$1" in
  start)
    if [ ! -f "$LIVE" ]; then
      echo "Fel: $LIVE saknas. Kan inte byta till underhållsläge."
      log "START misslyckades – $LIVE saknas."
      exit 1
    fi

    if [ ! -f "$MAINTENANCE" ]; then
      echo "Fel: $MAINTENANCE saknas. Kan inte byta till underhållsläge."
      log "START misslyckades – $MAINTENANCE saknas."
      exit 1
    fi

    confirm "Vill du verkligen aktivera underhållsläget?"

    mv "$LIVE" "$BACKUP"
    mv "$MAINTENANCE" "$LIVE"
    echo "Underhållssidan på tentplan.kswebb.se är nu aktiv ($LIVE)"
    log "START lyckades – $LIVE ersattes med $MAINTENANCE"
    notify "Underhållsläge aktivt på tentplan.kswebb.se" "Underhållssidan är nu aktiv och den ordinarie startsidan/indexsidan är sparad som $BACKUP.\n\nVänliga hälsningar\nvm215.kshome"
    ;;

  stop)
    if [ ! -f "$LIVE" ]; then
      echo "Fel: $LIVE saknas. Kan inte återställa normalläge."
      log "STOP misslyckades – $LIVE saknas."
      exit 1
    fi

    if [ ! -f "$BACKUP" ]; then
      echo "Fel: $BACKUP saknas. Kan inte återställa normalläge."
      log "STOP misslyckades – $BACKUP saknas."
      exit 1
    fi

    confirm "Vill du verkligen avsluta underhållsläget?"

    mv "$LIVE" "$MAINTENANCE"
    mv "$BACKUP" "$LIVE"
    echo "Ordinarie sida är nu återställd ($LIVE)"
    log "STOP lyckades – $LIVE återställdes från $BACKUP"
    notify "Underhållsläget inaktivt på tentplan.kswebb.se" "Ordinarie sida är nu återställd på tentplan.kswebb.se och underhållssidan är sparad som $MAINTENANCE.\n\nVänliga hälsningar\nvm215.kshome"
    ;;

  *)
    echo "Användning: $0 {start|stop}"
    ;;
esac