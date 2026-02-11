#!/bin/bash
CONFIG_DIR="/config"
MARKER="$CONFIG_DIR/.heyagi-customized"

# ── Always run: ensure agent-browser dirs exist, clean stale locks ──────────
mkdir -p "$CONFIG_DIR/.agent-browser" "$CONFIG_DIR/.browser-profile"
rm -f "$CONFIG_DIR/.browser-profile/SingletonLock" \
      "$CONFIG_DIR/.browser-profile/SingletonCookie" \
      "$CONFIG_DIR/.browser-profile/SingletonSocket" 2>/dev/null
chown -R abc:abc "$CONFIG_DIR/.agent-browser" "$CONFIG_DIR/.browser-profile"

if [ -f "$MARKER" ]; then
    echo "[heyagi] Already customized, skipping."
    exit 0
fi

echo "[heyagi] Applying desktop customization..."
mkdir -p "$CONFIG_DIR/.config/autostart"
mkdir -p "$CONFIG_DIR/.local/share/konsole"
mkdir -p "$CONFIG_DIR/Desktop"

# ── Symlink presentations into Desktop for easy access ─────────────────────
mkdir -p "$CONFIG_DIR/workspace/presentations"
ln -sfn "$CONFIG_DIR/workspace/presentations" "$CONFIG_DIR/Desktop/presentations"

# ── KDE Global: Breeze Dark ────────────────────────────────────────────────
cat > "$CONFIG_DIR/.config/kdeglobals" << 'EOF'
[General]
ColorScheme=BreezeDark
Name=Breeze Dark
widgetStyle=Breeze

[Icons]
Theme=breeze-dark

[KDE]
LookAndFeelPackage=org.kde.breezedark.desktop
widgetStyle=breeze
EOF

# ── KWin ────────────────────────────────────────────────────────────────────
cat > "$CONFIG_DIR/.config/kwinrc" << 'EOF'
[org.kde.kdecoration2]
theme=Breeze
library=org.kde.breeze

[Windows]
Placement=Centered

[Desktops]
Number=1
Rows=1
EOF

# ── Plasma theme ────────────────────────────────────────────────────────────
cat > "$CONFIG_DIR/.config/plasmarc" << 'EOF'
[Theme]
name=breeze-dark
EOF

# ── Konsole dark profile ───────────────────────────────────────────────────
cat > "$CONFIG_DIR/.local/share/konsole/HeyAGI.profile" << 'EOF'
[Appearance]
ColorScheme=Breeze
Font=Monospace,11,-1,5,50,0,0,0,0,0

[General]
Name=HeyAGI
Parent=FALLBACK/

[Scrolling]
HistoryMode=2
EOF

cat > "$CONFIG_DIR/.config/konsolerc" << 'EOF'
[Desktop Entry]
DefaultProfile=HeyAGI.profile

[MainWindow]
MenuBar=Disabled
ToolBarsMovable=Disabled
EOF

# ── Autostart: apply wallpaper + launcher icon after KDE session loads ──────
cat > "$CONFIG_DIR/.config/autostart/heyagi-desktop.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=HeyAGI Desktop Setup
Exec=/usr/share/wallpapers/heyagi/apply-desktop.sh
X-KDE-autostart-phase=2
EOF

cat > /usr/share/wallpapers/heyagi/apply-desktop.sh << 'SCRIPT'
#!/bin/bash
sleep 5

plasma-apply-wallpaperimage /usr/share/wallpapers/heyagi/wallpaper.png

PLASMA_RC="$HOME/.config/plasma-org.kde.plasma.desktop-appletsrc"
ICON_PATH="/usr/share/icons/heyagi/kortix-symbol-white.svg"

if [ -f "$PLASMA_RC" ]; then
    # Find the kickoff applet's [Configuration][General] section and inject icon
    # Get the containment/applet IDs for kickoff
    KICKOFF_SECTION=$(grep -B3 "plugin=org.kde.plasma.kickoff" "$PLASMA_RC" | grep "^\[Containments\]" | tail -1)
    
    if [ -n "$KICKOFF_SECTION" ]; then
        # Build the [Configuration][General] section name
        GENERAL_SECTION="${KICKOFF_SECTION%]}][Configuration][General]"
        
        if grep -q "$(echo "$GENERAL_SECTION" | sed 's/\[/\\[/g; s/\]/\\]/g')" "$PLASMA_RC"; then
            # Section exists -- replace or add icon line
            ESCAPED=$(echo "$GENERAL_SECTION" | sed 's/\[/\\[/g; s/\]/\\]/g')
            if grep -A10 "$ESCAPED" "$PLASMA_RC" | grep -q "^icon="; then
                sed -i "/$ESCAPED/,/^\[/{s|^icon=.*|icon=$ICON_PATH|}" "$PLASMA_RC"
            else
                sed -i "/$ESCAPED/a icon=$ICON_PATH" "$PLASMA_RC"
            fi
        else
            # Section doesn't exist -- create it
            CONF_SECTION="${KICKOFF_SECTION%]}][Configuration]"
            ESCAPED_CONF=$(echo "$CONF_SECTION" | sed 's/\[/\\[/g; s/\]/\\]/g')
            sed -i "/$ESCAPED_CONF/,/^\[/{/^\[.*\]/!b;i\\${GENERAL_SECTION}\nicon=$ICON_PATH
            }" "$PLASMA_RC"
        fi
    fi
    
    # Restart plasmashell to pick up icon change
    kquitapp5 plasmashell 2>/dev/null
    sleep 2
    kstart5 plasmashell 2>/dev/null &
fi
SCRIPT
chmod +x /usr/share/wallpapers/heyagi/apply-desktop.sh

# ── Fix ownership ──────────────────────────────────────────────────────────
# Give abc full ownership of everything under /config so opencode and its
# agents can freely create directories and files (presentations, output, etc.)
chown -R abc:abc "$CONFIG_DIR" 2>/dev/null

touch "$MARKER"
echo "[heyagi] Customization complete."
