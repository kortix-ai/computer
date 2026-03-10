#!/bin/bash
CONFIG_DIR="/workspace"
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

echo "[heyagi] Applying XFCE desktop customization (Alpine)..."

# ── XFCE: Wallpaper ───────────────────────────────────────────────────────
mkdir -p "$CONFIG_DIR/.config/xfce4/xfconf/xfce-perchannel-xml"
cat > "$CONFIG_DIR/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-desktop" version="1.0">
  <property name="backdrop" type="empty">
    <property name="screen0" type="empty">
      <property name="monitorVNC-0" type="empty">
        <property name="workspace0" type="empty">
          <property name="last-image" type="string" value="/usr/share/wallpapers/heyagi/wallpaper.png"/>
          <property name="image-style" type="int" value="5"/>
          <property name="color-style" type="int" value="0"/>
          <property name="rgba1" type="array">
            <value type="double" value="0.10196"/>
            <value type="double" value="0.10588"/>
            <value type="double" value="0.14902"/>
            <value type="double" value="1.0"/>
          </property>
        </property>
      </property>
      <property name="monitorscreen" type="empty">
        <property name="workspace0" type="empty">
          <property name="last-image" type="string" value="/usr/share/wallpapers/heyagi/wallpaper.png"/>
          <property name="image-style" type="int" value="5"/>
          <property name="color-style" type="int" value="0"/>
          <property name="rgba1" type="array">
            <value type="double" value="0.10196"/>
            <value type="double" value="0.10588"/>
            <value type="double" value="0.14902"/>
            <value type="double" value="1.0"/>
          </property>
        </property>
      </property>
    </property>
  </property>
</channel>
EOF

# ── XFCE: Dark theme (adw-gtk3-dark — Alpine's equivalent of Adwaita-dark)
cat > "$CONFIG_DIR/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xsettings" version="1.0">
  <property name="Net" type="empty">
    <property name="ThemeName" type="string" value="adw-gtk3-dark"/>
    <property name="IconThemeName" type="string" value="Adwaita"/>
    <property name="CursorThemeName" type="string" value="Breeze_Light"/>
  </property>
  <property name="Gtk" type="empty">
    <property name="FontName" type="string" value="Sans 10"/>
    <property name="CursorThemeSize" type="int" value="24"/>
  </property>
</channel>
EOF

# ── XFCE: Window Manager dark theme (Daloa — only xfwm4 theme on Alpine)
cat > "$CONFIG_DIR/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="theme" type="string" value="Daloa"/>
    <property name="title_font" type="string" value="Sans Bold 9"/>
    <property name="placement_ratio" type="int" value="50"/>
    <property name="cycle_tabwin_mode" type="int" value="0"/>
  </property>
</channel>
EOF

# ── XFCE: Terminal dark profile ──────────────────────────────────────────
mkdir -p "$CONFIG_DIR/.config/xfce4/terminal"
cat > "$CONFIG_DIR/.config/xfce4/terminal/terminalrc" << 'EOF'
[Configuration]
BackgroundMode=TERMINAL_BACKGROUND_TRANSPARENT
BackgroundDarkness=0.90
ColorForeground=#c0caf5
ColorBackground=#1a1b26
ColorCursor=#c0caf5
ColorPalette=#15161e;#f7768e;#9ece6a;#e0af68;#7aa2f7;#bb9af7;#7dcfff;#a9b1d6;#414868;#f7768e;#9ece6a;#e0af68;#7aa2f7;#bb9af7;#7dcfff;#c0caf5
FontName=Monospace 11
MiscAlwaysShowTabs=FALSE
MiscBordersDefault=TRUE
MiscShowUnsafePasteDialog=FALSE
ScrollingUnlimited=TRUE
EOF

# ── GTK dark theme (fallback for GTK2 apps) ───────────────────────────────
cat > "$CONFIG_DIR/.gtkrc-2.0" << 'EOF'
gtk-theme-name="adw-gtk3-dark"
gtk-icon-theme-name="Adwaita"
gtk-font-name="Sans 10"
gtk-cursor-theme-name="Breeze_Light"
EOF

mkdir -p "$CONFIG_DIR/.config/gtk-3.0"
cat > "$CONFIG_DIR/.config/gtk-3.0/settings.ini" << 'EOF'
[Settings]
gtk-theme-name=adw-gtk3-dark
gtk-icon-theme-name=Adwaita
gtk-font-name=Sans 10
gtk-application-prefer-dark-theme=true
gtk-cursor-theme-name=Breeze_Light
EOF

# ── Fix ownership ──────────────────────────────────────────────────────────
chown -R abc:abc "$CONFIG_DIR" 2>/dev/null

touch "$MARKER"
echo "[heyagi] XFCE customization complete."
