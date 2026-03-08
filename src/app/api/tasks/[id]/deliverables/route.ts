/**
 * Task Deliverables API
 * Endpoints for managing task deliverables (files, URLs, artifacts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateDeliverableSchema } from '@/lib/validation';
import { existsSync } from 'fs';
import pathLib from 'path';

import type { TaskDeliverable } from '@/lib/types';

export const dynamic = 'force-dynamic';
const PROJECTS_BASE = (process.env.PROJECTS_PATH || '~/projects').replace(/^~/, process.env.HOME || '');
/**
 * GET /api/tasks/[id]/deliverables
 * Retrieve all deliverables for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const db = getDb();

    const deliverables = db.prepare(`
      SELECT *
      FROM task_deliverables
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as TaskDeliverable[];

    return NextResponse.json(deliverables);
  } catch (error) {
    console.error('Error fetching deliverables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deliverables' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/deliverables
 * Add a new deliverable to a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await request.json();
    
    // Validate input with Zod
    const validation = CreateDeliverableSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { deliverable_type, title, path, description } = validation.data;

    // Validate file existence for file deliverables
    let normalizedPath = path;
    if (deliverable_type === 'file' && path) {
      // Accept either absolute paths or relative paths (relative to PROJECTS_BASE)
      const expandedPath = path.replace(/^~/, process.env.HOME || '');
      normalizedPath = pathLib.isAbsolute(expandedPath)
        ? pathLib.normalize(expandedPath)
        : pathLib.join(PROJECTS_BASE, pathLib.normalize(expandedPath));

      if (!existsSync(normalizedPath)) {
        return NextResponse.json(
          {
            error: 'File deliverable path does not exist on Mission Control storage',
            requestedPath: path,
            resolvedPath: normalizedPath,
            projectsBase: PROJECTS_BASE,
            hint: 'Upload file first via POST /api/files/upload, then register deliverable using response.path'
          },
          { status: 400 }
        );
      }
    }

    const db = getDb();
    const id = crypto.randomUUID();

    // Insert deliverable
    db.prepare(`
      INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      taskId,
      deliverable_type,
      title,
      path || null,
      description || null
    );

    // Get the created deliverable
    const deliverable = db.prepare(`
      SELECT *
      FROM task_deliverables
      WHERE id = ?
    `).get(id) as TaskDeliverable;

    // Broadcast to SSE clients
    broadcast({
      type: 'deliverable_added',
      payload: deliverable,
    });

    return NextResponse.json(deliverable, { status: 201 });
  } catch (error) {
    console.error('Error creating deliverable:', error);
    return NextResponse.json(
      { error: 'Failed to create deliverable' },
      { status: 500 }
    );
  }
}
