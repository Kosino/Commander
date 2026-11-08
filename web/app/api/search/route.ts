import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

function runPython(scriptPath: string, query: string, cwd: string, bin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn(bin, [scriptPath, query], { cwd });
    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('error', (err) => reject(err));
    py.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr || `${bin} exited with ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || '';
  if (!query.trim()) {
    return NextResponse.json({ cards: [] });
  }

  const root = path.join(process.cwd(), '..');
  const scriptPath = path.join(root, 'search_cards.py');
  const bins = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

  let lastError: unknown;
  for (const bin of bins) {
    try {
      const stdout = await runPython(scriptPath, query, root, bin);
      const cards = JSON.parse(stdout.trim() || '[]');
      return NextResponse.json({ cards: cards.slice(0, 20) });
    } catch (err) {
      lastError = err;
    }
  }

  console.error('search failed', lastError);
  return NextResponse.json({ cards: [], error: 'search failed' }, { status: 500 });
}
