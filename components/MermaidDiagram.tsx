import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Colors from '@/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * Parses a markdown string and extracts all ```mermaid blocks.
 * Returns an array of raw mermaid diagram strings.
 */
export function extractMermaidBlocks(markdown: string): string[] {
  const results: string[] = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const code = match[1].trim();
    if (code) results.push(code);
  }
  return results;
}

// ── MermaidDiagram component ──────────────────────────────────
interface MermaidDiagramProps {
  code: string;
  index: number;
}

export function MermaidDiagram({ code, index }: MermaidDiagramProps) {
  const [height, setHeight] = useState(240);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const escapedCode = code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1A191D;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 16px;
      min-height: 100vh;
    }
    .mermaid {
      max-width: 100%;
      overflow: hidden;
    }
    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }
    .error {
      color: #F87171;
      font-family: monospace;
      font-size: 13px;
      padding: 12px;
    }
  </style>
</head>
<body>
  <div class="mermaid">${escapedCode}</div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        background: '#1A191D',
        primaryColor: '#D4A853',
        primaryTextColor: '#F0EDE6',
        primaryBorderColor: '#2A2832',
        lineColor: '#8E8A82',
        secondaryColor: '#252329',
        tertiaryColor: '#302E35',
      },
      securityLevel: 'loose',
    });

    mermaid.run().then(() => {
      // Tell the React Native layer how tall the diagram is
      const el = document.querySelector('.mermaid');
      if (el) {
        const h = el.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: h }));
      }
    }).catch((err) => {
      document.body.innerHTML = '<div class="error">⚠️ Could not render diagram: ' + err.message + '</div>';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: 80 }));
    });
  </script>
</body>
</html>`;

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'height' && msg.value > 0) {
        setHeight(msg.value + 40); // extra padding
        setLoading(false);
      }
    } catch {}
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>◈</Text>
        <Text style={styles.headerLabel}>Diagram {index + 1}</Text>
      </View>

      {loading && (
        <View style={[styles.loader, { height }]}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.loaderText}>Rendering diagram…</Text>
        </View>
      )}

      <WebView
        source={{ html }}
        style={[styles.webview, { height, opacity: loading ? 0 : 1 }]}
        scrollEnabled={false}
        onMessage={handleMessage}
        onError={() => { setError(true); setLoading(false); }}
        javaScriptEnabled
        originWhitelist={['*']}
        onLoadEnd={() => {
          // Fallback: stop the loading spinner after 4s max
          setTimeout(() => setLoading(false), 4000);
        }}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ Could not render diagram. Check mermaid syntax.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    fontSize: 14,
    color: Colors.accent,
  },
  headerLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  webview: {
    width: SCREEN_WIDTH - 40 - 2, // account for margin + border
    backgroundColor: '#1A191D',
  },
  loader: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
  },
  loaderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textTertiary,
  },
  errorBox: {
    padding: 14,
    backgroundColor: Colors.danger + '12',
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.danger,
  },
});
