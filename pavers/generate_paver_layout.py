import math, random, sys
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import A0, landscape

random.seed(7)

# ---------------- geometry from the CAD pdf (raw page units) ----------------
CX, CY = 2312.5, 2359.5                 # circle centre (dimension origin)
S = 1115.0 / 8.36                         # raw units per metre (dim 8.36 m)

def D(X, Y):                              # raw -> display metres (page /Rotate 270)
    return (-(Y - CY) / S, (X - CX) / S)

poly_raw = [(1198,2425),(132,2555),(203,3330),(1042,3202),(1172,3360),(3535,2894),
            (3660,3528),(3453,3568),(3507,3842),(3700,3804),(3748,4049),(3555,4087),
            (3589,4262),(3784,4223),(3932,4966),(4052,5420),(4524,5295),(3960,2398),
            (3536,2384),(3459,2079)]

def bez(p0, p1, p2, p3, n=60):
    out = []
    for i in range(1, n + 1):
        t = i / n; u = 1 - t
        out.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],
                    u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
    return out

def xf(pts, e, f):                        # cm "0 -1 1 0 e f"
    return [(y + e, -x + f) for x, y in pts]

arc2 = xf([(1162.50452,167.43248),(1097.64905,617.73151),(778.57526,990.07385),(343.52457,1123.13892)], 2336.5, 2423.5)
arc1 = xf([(-65.73444,-1113.56152),(274.44974,-1133.64282),(605.15308,-997.12512),(832.10986,-742.92218)], 2312.5, 2359.5)
arc1b = xf([(832.10986,-742.92218),(1059.06665,-488.71924),(1157.37866,-144.71848),(1099.02234,191.02409)], 2312.5, 2359.5)
# boundary: polyline 1198,2425 ... 3459,2079 then arc2 reversed, arc1b reversed, arc1 reversed
straight = [D(*p) for p in poly_raw]
a2 = [D(*p) for p in bez(*arc2[::-1])]
a1b = [D(*p) for p in bez(*arc1b[::-1])]
a1 = [D(*p) for p in bez(*arc1[::-1])]
POLY = straight + a2 + a1b + a1[:-1]
STRAIGHT_EDGES = [(straight[i], straight[i+1]) for i in range(len(straight) - 1)]

R = 8.36
W = 0.1016                                # 4" paver
J = 0.004                                 # joint
P = W + J
EDGE = 0.05                               # edging strip where plaza meets arms
RG = R + EDGE

# chord P1-P2 splits plaza bulge (H side) from arm side
P1, P2 = straight[0], straight[-1]
apex = D(2503.5, 1260.5)
def side(p):
    return (P2[0]-P1[0])*(p[1]-P1[1]) - (P2[1]-P1[1])*(p[0]-P1[0])
HS = 1 if side(apex) > 0 else -1
def inH(p): return side(p) * HS > 0

def inside(pt, poly=POLY):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[i-1]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1) + x1:
            c = not c
    return c

def seg_dist(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx-ax, by-ay
    t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)))
    return math.hypot(px-ax-t*dx, py-ay-t*dy)

# union of disc(Rx) and half-plane H, as a polygon
def union_poly(Rx):
    dx, dy = P2[0]-P1[0], P2[1]-P1[1]; L = math.hypot(dx, dy); dx, dy = dx/L, dy/L
    nx, ny = -dy * HS, dx * HS            # normal pointing into H
    # perpendicular foot of centre on chord
    s0 = (0-P1[0])*dx + (0-P1[1])*dy
    fx, fy = P1[0]+s0*dx, P1[1]+s0*dy
    dist = (0-fx)*nx + (0-fy)*ny          # signed, >0 if centre in H
    half = math.sqrt(Rx*Rx - dist*dist)
    A = (fx - half*dx, fy - half*dy); B = (fx + half*dx, fy + half*dy)
    tA = math.atan2(A[1], A[0]); tB = math.atan2(B[1], B[0])
    # arc on non-H side from A to B
    def arc(t0, t1):
        n = 400
        return [(Rx*math.cos(t0+(t1-t0)*i/n), Rx*math.sin(t0+(t1-t0)*i/n)) for i in range(n+1)]
    cand1 = arc(tA, tB if tB > tA else tB + 2*math.pi)
    cand2 = arc(tA, tB if tB < tA else tB - 2*math.pi)
    mid1 = cand1[len(cand1)//2]
    pts = cand1 if not inH(mid1) else cand2
    # bulge side: chord B->P2, then out to ROUT and round the H side back to A
    ROUT = 9.3
    tP2 = math.atan2(P2[1], P2[0]); tA2 = math.atan2(A[1], A[0])
    o1 = [(ROUT*math.cos(q[0]), ROUT*math.sin(q[0])) for q in [(tP2 + ((tA2 if tA2 > tP2 else tA2 + 2*math.pi) - tP2)*i/400,) for i in range(401)]]
    o2 = [(ROUT*math.cos(q[0]), ROUT*math.sin(q[0])) for q in [(tP2 + ((tA2 if tA2 < tP2 else tA2 - 2*math.pi) - tP2)*i/400,) for i in range(401)]]
    outer = o1 if inH(o1[200]) else o2
    if math.hypot(*P2) > Rx:
        pts = pts + [P2]
    return pts + outer + [A]

U_R = union_poly(R)

# value noise
_h = {}
def h(i, j):
    k = (i, j)
    if k not in _h: _h[k] = random.random()
    return _h[k]
def noise(x, y):
    i, j = math.floor(x), math.floor(y); fx, fy = x-i, y-j
    sx, sy = fx*fx*(3-2*fx), fy*fy*(3-2*fy)
    a = h(i,j) + (h(i+1,j)-h(i,j))*sx
    b = h(i,j+1) + (h(i+1,j+1)-h(i,j+1))*sx
    return a + (b-a)*sy

def any_inside(corners):
    return any(inside(c) for c in corners)

# ---------------- radial pavers ----------------
n_rings = int(round((R - 0.33) / P))
R0 = R - n_rings * P
ring_pavers = []
rr = R0
k = 0
while rr < 9.2:
    rc = rr + W / 2
    N = int(2 * math.pi * rr / P)
    off = random.random() * 2 * math.pi / N
    t = (rr - R0) / (R - R0)
    for i in range(N):
        th = off + 2 * math.pi * i / N
        c, s = math.cos(th), math.sin(th)
        cx, cy = rc * c, rc * s
        if rr + W > R + 1e-6 and not inside((cx, cy), U_R):
            continue
        hw = W / 2
        corners = [(cx + a*c*hw - s*b*hw, cy + a*s*hw + c*b*hw)
                   for a, b in ((-1,-1),(1,-1),(1,1),(-1,1))]
        if not any_inside(corners):
            continue
        # scatter: light near centre, dithered "drips" fading outward
        n = (noise(th * 14.0, t * 2.5) - 0.5) * 2 * 0.18 + (noise(th * 60, t * 8 + 3.3) - 0.5) * 2 * 0.10
        pw = max(0.0, min(1.0, 1.4 - 1.65 * t + 1.4 * n))
        pw = 0.025 + 0.95 * pw
        white = random.random() < pw
        ring_pavers.append((corners, white))
    rr += P; k += 1

# ---------------- linear (grid) pavers ----------------
ga, gb = D(1172, 3360), D(3535, 2894)
ang = math.atan2(gb[1]-ga[1], gb[0]-ga[0])
ux, uy = math.cos(ang), math.sin(ang)
vx, vy = -uy, ux
xs = [p[0] for p in POLY]; ys = [p[1] for p in POLY]
ext = max(max(xs)-min(xs), max(ys)-min(ys)) * 1.5
grid_pavers = []
FADE = 1.6
nmax = int(ext / P)
for i in range(-nmax, nmax):
    for j in range(-nmax, nmax):
        cx = ga[0] + (i + 0.5) * P * ux + (j + 0.5) * P * vx
        cy = ga[1] + (i + 0.5) * P * uy + (j + 0.5) * P * vy
        if cx < min(xs)-0.2 or cx > max(xs)+0.2 or cy < min(ys)-0.2 or cy > max(ys)+0.2:
            continue
        r = math.hypot(cx, cy)
        if r < R - 0.1:
            continue
        if inside((cx, cy), U_R) and r > R + 0.1:
            continue
        hw = W / 2
        corners = [(cx + a*hw*ux + b*hw*vx, cy + a*hw*uy + b*hw*vy)
                   for a, b in ((-1,-1),(1,-1),(1,1),(-1,1))]
        if not any_inside(corners):
            continue
        d = min(seg_dist((cx, cy), a, b) for a, b in STRAIGHT_EDGES)
        t = d / FADE
        # coherent noise along the arm so the speckle forms ragged "drips"
        u = cx * ux + cy * uy; v = cx * vx + cy * vy
        n = (noise(u * 1.2, v * 2.0) - 0.5) * 2 * 0.22 + (noise(u * 6, v * 6 + 9) - 0.5) * 2 * 0.10
        pw = max(0.0, min(1.0, 1.0 - 1.1 * t + n))
        pw = 0.02 + 0.93 * pw ** 1.3
        white = random.random() < pw
        grid_pavers.append((corners, white))

print("ring", len(ring_pavers), "grid", len(grid_pavers), file=sys.stderr)

# ---------------- PDF ----------------
PW, PH = landscape(A0)
SCALE = 50
M = 1000 / SCALE * mm                     # pt per metre
MARGIN = 20 * mm
TB_W = 250 * mm
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
draw_w = PW - 2 * MARGIN - TB_W
ox = MARGIN + (draw_w - (maxx - minx) * M) / 2 - minx * M
oy = (PH - (maxy - miny) * M) / 2 - miny * M
def T(p): return (ox + p[0] * M, oy + p[1] * M)

c = canvas.Canvas(sys.argv[1], pagesize=(PW, PH))
c.setTitle("Paver Layout Plan")
c.setAuthor("Spatial AI")

# border
c.setLineWidth(1.2)
c.rect(10*mm, 10*mm, PW - 20*mm, PH - 20*mm)

def path_poly(pts, close=True):
    p = c.beginPath()
    x, y = T(pts[0]); p.moveTo(x, y)
    for q in pts[1:]:
        x, y = T(q); p.lineTo(x, y)
    if close: p.close()
    return p

def circle_pts(r, n=720, cw=False):
    pts = [(r*math.cos(2*math.pi*i/n), r*math.sin(2*math.pi*i/n)) for i in range(n)]
    return pts[::-1] if cw else pts


def draw_pavers(pavers):
    c.setLineWidth(0.12)
    c.setStrokeColorRGB(0, 0, 0)
    blacks = c.beginPath(); whites = c.beginPath()
    for corners, white in pavers:
        p = whites if white else blacks
        x, y = T(corners[0]); p.moveTo(x, y)
        for q in corners[1:]:
            x, y = T(q); p.lineTo(x, y)
        p.close()
    c.setFillColorRGB(1, 1, 1); c.drawPath(whites, stroke=1, fill=1)
    c.setFillColorRGB(0, 0, 0); c.setStrokeColorRGB(1, 1, 1); c.drawPath(blacks, stroke=1, fill=1)
    c.setStrokeColorRGB(0, 0, 0)

# ring zone: polygon ∩ (disc(R) ∪ H)
c.saveState()
c.clipPath(path_poly(POLY), stroke=0, fill=0)
c.clipPath(path_poly(union_poly(R)), stroke=0, fill=0)
draw_pavers(ring_pavers)
c.restoreState()

# grid zone: polygon minus (disc(RG) ∪ H)
c.saveState()
c.clipPath(path_poly(POLY), stroke=0, fill=0)
comp = c.beginPath()
x0, y0 = T((-200, -200)); x1, y1 = T((200, 200))
comp.rect(x0, y0, x1 - x0, y1 - y0)
u = union_poly(RG)
x, y = T(u[0]); comp.moveTo(x, y)
for q in u[1:]:
    x, y = T(q); comp.lineTo(x, y)
comp.close()
c.clipPath(comp, stroke=0, fill=0, fillMode=0)   # even-odd
draw_pavers(grid_pavers)
c.restoreState()

# edging strip (plaza / arm junction) drawn as double line
c.saveState()
c.clipPath(path_poly(POLY), stroke=0, fill=0)
band = c.beginPath()
for pts in (union_poly(RG), union_poly(R)[::-1]):
    x, y = T(pts[0]); band.moveTo(x, y)
    for q in pts[1:]:
        x, y = T(q); band.lineTo(x, y)
    band.close()
c.setFillColorRGB(1, 1, 1); c.setLineWidth(0.4)
c.drawPath(band, stroke=1, fill=1, fillMode=0)
c.restoreState()

# centre stone
c.setLineWidth(0.4); c.setFillColorRGB(1, 1, 1)
cx0, cy0 = T((0, 0))
c.circle(cx0, cy0, (R0 - J) * M, stroke=1, fill=1)
c.setLineWidth(0.25)
c.line(cx0 - 0.25*M, cy0, cx0 + 0.25*M, cy0)
c.line(cx0, cy0 - 0.25*M, cx0, cy0 + 0.25*M)

# plot outline
c.setLineWidth(1.0); c.setStrokeColorRGB(0, 0, 0)
c.drawPath(path_poly(POLY), stroke=1, fill=0)

# radius dimension from centre (8.36)
def arrow(tip, direction, size=2.2*mm):
    dx, dy = direction; L = math.hypot(dx, dy); dx, dy = dx/L, dy/L
    p = c.beginPath(); p.moveTo(*tip)
    p.lineTo(tip[0] - size*dx - size*0.3*dy, tip[1] - size*dy + size*0.3*dx)
    p.lineTo(tip[0] - size*dx + size*0.3*dy, tip[1] - size*dy - size*0.3*dx)
    p.close(); c.setFillColorRGB(0, 0, 0); c.drawPath(p, stroke=0, fill=1)

def dim_label(x, y, text, size=9):
    c.setFont("Helvetica-Bold", size)
    w = c.stringWidth(text, "Helvetica-Bold", size)
    c.setFillColorRGB(1, 1, 1)
    c.rect(x - w/2 - 1.2*mm, y - 1.2*mm, w + 2.4*mm, size + 1.6*mm, stroke=0, fill=1)
    c.setFillColorRGB(0, 0, 0)
    c.drawCentredString(x, y, text)

ex = T((R, 0))
c.setStrokeColorRGB(1, 1, 1); c.setLineWidth(2.4)
c.line(cx0, cy0, ex[0] - 2*mm, ex[1])
c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(0.7)
c.line(cx0, cy0, ex[0], ex[1])
c.setFillColorRGB(1, 1, 1); c.circle(ex[0] - 1.4*mm, ex[1], 1.9*mm, stroke=0, fill=1)
arrow(ex, (1, 0))
c.setFillColorRGB(0, 0, 0); c.circle(cx0, cy0, 0.6*mm, stroke=0, fill=1)
dim_label((cx0 + ex[0]) / 2, cy0 + 0.6*mm - 4, "R 8.36", 11)

# paver module dimensions on a ring near the dimension line
dim_label(cx0, cy0 - 0.62*M - 3*mm, "CENTRE", 8)

# ---------------- title block / legend ----------------
tx = PW - MARGIN - TB_W + 15*mm
ty = PH - 40*mm
c.setLineWidth(0.8)
c.line(PW - MARGIN - TB_W, 10*mm, PW - MARGIN - TB_W, PH - 10*mm)
c.setFont("Helvetica-Bold", 22); c.setFillColorRGB(0, 0, 0)
c.drawString(tx, ty, "PAVER LAYOUT PLAN")
c.setFont("Helvetica", 12)
c.drawString(tx, ty - 9*mm, "Radial & linear scatter (dither) pattern")

ly = ty - 30*mm
c.setFont("Helvetica-Bold", 12); c.drawString(tx, ly, "LEGEND"); ly -= 12*mm
sw = 8*mm
c.setLineWidth(0.5)
c.setFillColorRGB(0, 0, 0); c.rect(tx, ly, sw, sw, stroke=1, fill=1)
c.setFont("Helvetica", 11); c.drawString(tx + sw + 5*mm, ly + 2.5*mm, "Black paver, 4\" x 4\" (101.6 x 101.6 mm)")
ly -= 13*mm
c.setFillColorRGB(1, 1, 1); c.rect(tx, ly, sw, sw, stroke=1, fill=1)
c.setFillColorRGB(0, 0, 0); c.drawString(tx + sw + 5*mm, ly + 2.5*mm, "White paver, 4\" x 4\" (101.6 x 101.6 mm)")
ly -= 13*mm
c.setLineWidth(1.0); c.line(tx, ly + 4*mm, tx + sw, ly + 4*mm)
c.drawString(tx + sw + 5*mm, ly + 2.5*mm, "Plot boundary")
ly -= 13*mm
c.setLineWidth(0.4); c.setFillColorRGB(1, 1, 1)
c.rect(tx, ly + 3*mm, sw, 2*mm, stroke=1, fill=1)
c.setFillColorRGB(0, 0, 0)
c.drawString(tx + sw + 5*mm, ly + 2.5*mm, "50 mm edging strip at R 8.36 (plaza / linear junction)")

ly -= 25*mm
c.setFont("Helvetica-Bold", 12); c.drawString(tx, ly, "NOTES"); ly -= 9*mm
c.setFont("Helvetica", 10)
nb = sum(1 for _, w in ring_pavers + grid_pavers if not w)
nw = sum(1 for _, w in ring_pavers + grid_pavers if w)
notes = [
    "1. All dimensions in metres unless noted otherwise.",
    "2. Dimensions are taken from the centre of the circle.",
    "3. Pavers: 4\" x 4\" (101.6 mm) square units, 4 mm joints.",
    f"4. Circular zone: {n_rings + 1} concentric courses laid radially from",
    f"    a {2*(R0-J):.2f} m dia. centre stone out to R 8.36 / plot edge.",
    "5. Linear zones: stack-bond grid parallel to the long plot edge;",
    "    pavers cut to suit at plot boundary and edging strip.",
    "6. Scatter: white pavers dense at the circle centre, dithering",
    "    out to black toward R 8.36. In the linear zones white pavers",
    f"    cluster along the plot edges and fade to black over ~{FADE:.1f} m.",
    "7. Final scatter to be set out on site per this drawing.",
    f"8. Approx. quantities (incl. cut units): black {nb:,}, white {nw:,}.",
]
for n in notes:
    c.drawString(tx, ly, n); ly -= 6.5*mm

# scale bar
ly -= 12*mm
c.setFont("Helvetica-Bold", 12); c.drawString(tx, ly, "SCALE 1:50 (A0)"); ly -= 10*mm
c.setLineWidth(0.5)
for i in range(5):
    c.setFillColorRGB(0, 0, 0) if i % 2 == 0 else c.setFillColorRGB(1, 1, 1)
    c.rect(tx + i*M, ly, M, 2.5*mm, stroke=1, fill=1)
c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 9)
for i in range(6):
    c.drawCentredString(tx + i*M, ly - 4.5*mm, str(i))
c.drawString(tx + 5*M + 3*mm, ly - 4.5*mm, "m")

# north-ish orientation note omitted; title block footer
c.setLineWidth(0.8)
c.line(PW - MARGIN - TB_W, 45*mm, PW - 10*mm, 45*mm)
c.setFont("Helvetica", 10)
c.drawString(tx, 33*mm, "Drawing: Paver layout - line drawing")
c.drawString(tx, 25*mm, "Units: metres    Paper: A0    Scale: 1:50")
c.drawString(tx, 17*mm, "Base plot: pavers.pdf (AutoCAD)")
c.showPage(); c.save()
