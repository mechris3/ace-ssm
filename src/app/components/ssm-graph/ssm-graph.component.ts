import {
  Component,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
} from '@angular/core';
import * as d3 from 'd3';
import { ISSMNode, ISSMEdge, IGoal } from '../../models/ssm.model';

/** Extends ISSMNode with D3 simulation position fields. */
interface SimNode extends ISSMNode, d3.SimulationNodeDatum {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

/** Extends ISSMEdge with resolved source/target for D3 force link. */
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  relationType: string;
  source: string | SimNode;
  target: string | SimNode;
}

@Component({
  selector: 'app-ssm-graph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./ssm-graph.component.css'],
  template: `<svg #svgEl class="ssm-graph-svg"></svg>`,
})
export class SSMGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() nodes: ISSMNode[] = [];
  @Input() edges: ISSMEdge[] = [];
  @Input() activeGoal: IGoal | null = null;
  @Input() selectedNodeId: string | null = null;
  @Input() highlightNodeId: string | null = null;

  @Output() onNodeClick = new EventEmitter<string>();

  @ViewChild('svgEl', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private simulation!: d3.Simulation<SimNode, SimEdge>;
  private edgeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private simNodes: SimNode[] = [];
  private simEdges: SimEdge[] = [];
  private initialized = false;
  private width = 800;
  private height = 600;

  ngAfterViewInit(): void {
    const el = this.svgRef.nativeElement;
    this.width = el.clientWidth || 800;
    this.height = el.clientHeight || 600;

    this.svg = d3.select(el);

    // Defs: grid pattern + arrowhead marker
    const defs = this.svg.append('defs');

    // Grid-dot background pattern
    const pattern = defs.append('pattern')
      .attr('id', 'grid-dots')
      .attr('width', 20)
      .attr('height', 20)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle')
      .attr('cx', 10)
      .attr('cy', 10)
      .attr('r', 1)
      .attr('class', 'grid-dot');

    // Arrowhead marker
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'var(--border-color)');

    // Background rect with grid pattern
    this.svg.append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'url(#grid-dots)');

    // Layer groups: edges below nodes
    this.edgeGroup = this.svg.append('g').attr('class', 'edges-layer');
    this.nodeGroup = this.svg.append('g').attr('class', 'nodes-layer');

    // Initialize D3 force simulation
    this.simulation = d3.forceSimulation<SimNode, SimEdge>()
      .force('link', d3.forceLink<SimNode, SimEdge>().id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide(40))
      .on('tick', () => this.ticked());

    this.initialized = true;

    // If inputs arrived before init, render now
    if (this.nodes.length > 0 || this.edges.length > 0) {
      this.updateGraph();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialized) { return; }

    if (changes['nodes'] || changes['edges']) {
      this.updateGraph();
    }

    if (changes['activeGoal']) {
      this.updateSearchlight();
    }

    if (changes['selectedNodeId']) {
      this.updateSelection();
    }

    if (changes['highlightNodeId']) {
      this.updateHighlight();
    }
  }

  ngOnDestroy(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  // ── Task 8.2: Enter/Update/Exit ──────────────────────────────────

  private updateGraph(): void {
    this.mergeSimNodes();
    this.mergeSimEdges();

    // ── Edges ──
    const edgeSel = this.edgeGroup
      .selectAll<SVGGElement, SimEdge>('g.edge-group')
      .data(this.simEdges, (d: SimEdge) => d.id);

    // Exit
    edgeSel.exit().remove();

    // Enter
    const edgeEnter = edgeSel.enter().append('g').attr('class', 'edge-group');
    edgeEnter.append('line')
      .attr('class', 'edge-line')
      .attr('marker-end', 'url(#arrowhead)');
    edgeEnter.append('text')
      .attr('class', 'edge-label');

    // Update (merge enter + existing)
    const edgeMerge = edgeEnter.merge(edgeSel);
    edgeMerge.select('text.edge-label')
      .text((d: SimEdge) => d.relationType);

    // ── Nodes ──
    const nodeSel = this.nodeGroup
      .selectAll<SVGGElement, SimNode>('g.node-group')
      .data(this.simNodes, (d: SimNode) => d.id);

    // Exit
    nodeSel.exit().remove();

    // Enter
    const nodeEnter = nodeSel.enter().append('g').attr('class', 'node-group');
    nodeEnter.append('circle').attr('r', 18);
    nodeEnter.append('text').attr('dy', 30);

    // Apply drag to entering nodes
    nodeEnter.call(this.dragBehavior() as any);

    // Click handler
    nodeEnter.on('click', (_event: MouseEvent, d: SimNode) => {
      this.onNodeClick.emit(d.id);
    });

    // Update (merge enter + existing)
    const nodeMerge = nodeEnter.merge(nodeSel);

    // Update status class for color
    nodeMerge
      .attr('class', (d: SimNode) => {
        let cls = 'node-group status-' + d.status;
        if (d.id === this.selectedNodeId) { cls += ' selected'; }
        if (d.id === this.highlightNodeId) { cls += ' highlight-node'; }
        return cls;
      });

    // Update label text
    nodeMerge.select('text').text((d: SimNode) => d.label);

    // Restart simulation
    this.simulation.nodes(this.simNodes);
    (this.simulation.force('link') as d3.ForceLink<SimNode, SimEdge>)
      .links(this.simEdges);
    this.simulation.alpha(0.5).restart();

    // Apply searchlight + selection after graph update
    this.updateSearchlight();
    this.updateSelection();
    this.updateHighlight();
  }

  /** Merge incoming nodes into simNodes, preserving existing positions. */
  private mergeSimNodes(): void {
    const existing = new Map(this.simNodes.map(n => [n.id, n]));
    this.simNodes = this.nodes.map(n => {
      const prev = existing.get(n.id);
      if (prev) {
        // Preserve position, update data fields
        prev.label = n.label;
        prev.type = n.type;
        prev.status = n.status;
        return prev;
      }
      return { ...n } as SimNode;
    });
  }

  /** Merge incoming edges into simEdges. */
  private mergeSimEdges(): void {
    this.simEdges = this.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationType: e.relationType,
    } as SimEdge));
  }

  // ── Task 8.3: Drag behavior and node click ───────────────────────

  private dragBehavior(): d3.DragBehavior<SVGGElement, SimNode, SimNode | d3.SubjectPosition> {
    return d3.drag<SVGGElement, SimNode>()
      .on('start', (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
        d.fx = d.x;
        d.fy = d.y;
        this.simulation.alphaTarget(0.3).restart();
      })
      .on('drag', (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (_event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
        d.fx = null;
        d.fy = null;
        this.simulation.alphaTarget(0);
      });
  }

  // ── Tick: update positions ────────────────────────────────────────

  private ticked(): void {
    // Update edge lines
    this.edgeGroup.selectAll<SVGLineElement, SimEdge>('line.edge-line')
      .attr('x1', (d: SimEdge) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d: SimEdge) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d: SimEdge) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d: SimEdge) => (d.target as SimNode).y ?? 0);

    // Update edge labels (midpoint)
    this.edgeGroup.selectAll<SVGTextElement, SimEdge>('text.edge-label')
      .attr('x', (d: SimEdge) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
      .attr('y', (d: SimEdge) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2);

    // Update node positions
    this.nodeGroup.selectAll<SVGGElement, SimNode>('g.node-group')
      .attr('transform', (d: SimNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  // ── Task 8.4: Searchlight Effect ─────────────────────────────────

  private updateSearchlight(): void {
    // Remove searchlight from all nodes
    this.nodeGroup.selectAll('g.node-group')
      .classed('searchlight-active', false);

    // Apply searchlight to active goal's anchor node
    if (this.activeGoal) {
      this.nodeGroup.selectAll<SVGGElement, SimNode>('g.node-group')
        .filter((d: SimNode) => d.id === this.activeGoal!.anchorNodeId)
        .classed('searchlight-active', true);
    }
  }

  private updateSelection(): void {
    this.nodeGroup.selectAll<SVGGElement, SimNode>('g.node-group')
      .classed('selected', (d: SimNode) => d.id === this.selectedNodeId);
  }

  private updateHighlight(): void {
    this.nodeGroup.selectAll<SVGGElement, SimNode>('g.node-group')
      .classed('highlight-node', (d: SimNode) => d.id === this.highlightNodeId);
  }
}
