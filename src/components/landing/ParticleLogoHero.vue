<template>
    <div
        ref="hostRef"
        class="particulate-shell"
        @pointerenter="handlePointerEnter"
        @pointermove="handlePointerMove"
        @pointerleave="handlePointerLeave"
        @pointerdown="handlePointerDown"
        @pointerup="handlePointerUp"
    >
        <canvas ref="canvasRef" class="particulate-canvas" aria-hidden="true"></canvas>
        <div ref="cursorRef" class="particulate-cursor magnet" aria-hidden="true"></div>
    </div>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";

class Particle {
    constructor(x, y, originX, originY, r, g, b, size) {
        this.x = x;
        this.y = y;
        this.originX = originX;
        this.originY = originY;
        this.r = r;
        this.g = g;
        this.b = b;
        this.size = size;
        this.baseSize = size;
        this.vx = 0;
        this.vy = 0;
        this.friction = 0.92 + Math.random() * 0.04;
        this.springStrength = 0.008 + Math.random() * 0.008;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderSpeed = 0.02 + Math.random() * 0.02;
        this.opacity = 0;
        this.targetOpacity = 1;
    }

    update(mx, my, pointerActive, radius) {
        this.opacity += (this.targetOpacity - this.opacity) * 0.05;

        const dx = this.originX - this.x;
        const dy = this.originY - this.y;
        this.vx += dx * this.springStrength;
        this.vy += dy * this.springStrength;

        this.wanderAngle += this.wanderSpeed;
        this.vx += Math.cos(this.wanderAngle) * 0.05;
        this.vy += Math.sin(this.wanderAngle) * 0.05;

        if (pointerActive) {
            const mdx = this.x - mx;
            const mdy = this.y - my;
            const dist = Math.sqrt(mdx * mdx + mdy * mdy);

            if (dist < radius && dist > 0) {
                const force = (radius - dist) / radius;
                const angle = Math.atan2(mdy, mdx);
                const power = force * 2;
                this.vx -= Math.cos(angle) * power;
                this.vy -= Math.sin(angle) * power;
                this.size = this.baseSize * (1 - force * 0.3);
            } else {
                this.size += (this.baseSize - this.size) * 0.1;
            }
        } else {
            this.size += (this.baseSize - this.size) * 0.1;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;

        const s = Math.max(1, this.size);
        const half = s / 2;
        const radius = s > 4 ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(this.x - half + radius, this.y - half);
        ctx.lineTo(this.x + half - radius, this.y - half);
        ctx.quadraticCurveTo(this.x + half, this.y - half, this.x + half, this.y - half + radius);
        ctx.lineTo(this.x + half, this.y + half - radius);
        ctx.quadraticCurveTo(this.x + half, this.y + half, this.x + half - radius, this.y + half);
        ctx.lineTo(this.x - half + radius, this.y + half);
        ctx.quadraticCurveTo(this.x - half, this.y + half, this.x - half, this.y + half - radius);
        ctx.lineTo(this.x - half, this.y - half + radius);
        ctx.quadraticCurveTo(this.x - half, this.y - half, this.x - half + radius, this.y - half);
        ctx.fill();

        ctx.globalAlpha = 1;
    }
}

export default defineComponent({
    name: "ParticleLogoHero",
    props: {
        imageSrc: {
            type: String,
            required: true,
        },
        particleBudget: {
            type: Number,
            default: 8000,
        },
    },
    setup(props, { expose }) {
        const hostRef = ref(null);
        const canvasRef = ref(null);
        const cursorRef = ref(null);

        let ctx = null;
        let width = 0;
        let height = 0;
        let rafId = 0;
        let resizeObserver = null;
        let srcImg = null;
        let particles = [];
        let mx = 0;
        let my = 0;
        let pointerActive = false;
        let buildToken = 0;

        function updateCursor(x, y) {
            if (!cursorRef.value) {
                return;
            }

            cursorRef.value.style.left = `${x}px`;
            cursorRef.value.style.top = `${y}px`;
        }

        function resizeCanvas() {
            const host = hostRef.value;
            const canvas = canvasRef.value;
            if (!host || !canvas) {
                return;
            }

            const nextWidth = Math.round(host.clientWidth);
            if (!nextWidth) {
                return;
            }

            width = nextWidth;
            height = nextWidth;
            if (host.style.height !== `${height}px`) {
                host.style.height = `${height}px`;
            }

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
                return;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (srcImg) {
                shatterImage(srcImg);
            }
        }

        function shatterImage(img) {
            if (!ctx || !width || !height) {
                return;
            }

            particles = [];

            const scale = Math.min(width / img.width, height / img.height, 1);
            const imageWidth = Math.floor(img.width * scale);
            const imageHeight = Math.floor(img.height * scale);
            const originX = Math.floor((width - imageWidth) / 2);
            const originY = Math.floor((height - imageHeight) / 2);

            const offscreen = document.createElement("canvas");
            offscreen.width = imageWidth;
            offscreen.height = imageHeight;
            const offscreenContext = offscreen.getContext("2d", { willReadFrequently: true });
            if (!offscreenContext) {
                return;
            }

            offscreenContext.drawImage(img, 0, 0, imageWidth, imageHeight);
            const imgData = offscreenContext.getImageData(0, 0, imageWidth, imageHeight).data;

            const targetParticles = Math.min(props.particleBudget, Math.max(2000, (imageWidth * imageHeight) / 20));
            const gap = Math.max(2, Math.floor(Math.sqrt((imageWidth * imageHeight) / targetParticles)));
            const particleSize = Math.max(1.5, gap * 0.78);

            function isNearWhite(r, g, b) {
                return r > 245 && g > 245 && b > 245;
            }

            for (let y = 0; y < imageHeight; y += gap) {
                for (let x = 0; x < imageWidth; x += gap) {
                    const index = (y * imageWidth + x) * 4;
                    const r = imgData[index];
                    const g = imgData[index + 1];
                    const b = imgData[index + 2];
                    const a = imgData[index + 3];

                    if (a < 128) {
                        continue;
                    }

                    if (isNearWhite(r, g, b)) {
                        continue;
                    }

                    const px = originX + x;
                    const py = originY + y;

                    const edge = Math.random();
                    let sx;
                    let sy;

                    if (edge < 0.25) {
                        sx = Math.random() * width;
                        sy = -50;
                    } else if (edge < 0.5) {
                        sx = Math.random() * width;
                        sy = height + 50;
                    } else if (edge < 0.75) {
                        sx = -50;
                        sy = Math.random() * height;
                    } else {
                        sx = width + 50;
                        sy = Math.random() * height;
                    }

                    const particle = new Particle(sx, sy, px, py, r, g, b, particleSize);
                    particle.vx = (px - sx) * 0.01 + (Math.random() - 0.5) * 2;
                    particle.vy = (py - sy) * 0.01 + (Math.random() - 0.5) * 2;
                    particles.push(particle);
                }
            }
        }

        function loadImage(src) {
            const token = ++buildToken;
            const img = new Image();
            img.decoding = "async";
            img.crossOrigin = "anonymous";

            img.onload = () => {
                if (token !== buildToken) {
                    return;
                }

                srcImg = img;
                shatterImage(img);
            };

            img.src = src;
        }

        function render() {
            if (!ctx) {
                rafId = requestAnimationFrame(render);
                return;
            }

            ctx.clearRect(0, 0, width, height);

            const radius = Math.min(Math.max(width * 0.24, 120), 220);
            particles.forEach((particle) => {
                particle.update(mx, my, pointerActive, radius);
                particle.draw(ctx);
            });

            rafId = requestAnimationFrame(render);
        }

        function handlePointerEnter(event) {
            pointerActive = true;
            mx = event.offsetX;
            my = event.offsetY;
            updateCursor(mx, my);
        }

        function handlePointerMove(event) {
            mx = event.offsetX;
            my = event.offsetY;
            updateCursor(mx, my);
        }

        function handlePointerLeave() {
            pointerActive = false;
            mx = width / 2;
            my = height / 2;
        }

        function handlePointerDown() {
            if (cursorRef.value) {
                cursorRef.value.classList.add("is-active");
            }
        }

        function handlePointerUp() {
            if (cursorRef.value) {
                cursorRef.value.classList.remove("is-active");
            }
        }

        function setPointerFromClient(clientX, clientY) {
            const host = hostRef.value;
            if (!host) {
                return;
            }

            const bounds = host.getBoundingClientRect();
            mx = clientX - bounds.left;
            my = clientY - bounds.top;
            pointerActive = true;
            updateCursor(mx, my);
        }

        function clearPointerState() {
            pointerActive = false;
            mx = width / 2;
            my = height / 2;

            if (cursorRef.value) {
                cursorRef.value.classList.remove("is-active");
            }
        }

        onMounted(() => {
            resizeCanvas();
            mx = width / 2;
            my = height / 2;
            updateCursor(mx, my);

            if ("ResizeObserver" in window && hostRef.value) {
                resizeObserver = new ResizeObserver(() => {
                    resizeCanvas();
                });
                resizeObserver.observe(hostRef.value);
            } else {
                window.addEventListener("resize", resizeCanvas);
            }

            loadImage(props.imageSrc);
            rafId = requestAnimationFrame(render);
        });

        watch(
            () => props.imageSrc,
            (nextImageSrc) => {
                loadImage(nextImageSrc);
            },
        );

        onBeforeUnmount(() => {
            buildToken += 1;
            cancelAnimationFrame(rafId);

            if (resizeObserver) {
                resizeObserver.disconnect();
            } else {
                window.removeEventListener("resize", resizeCanvas);
            }
        });

        expose({
            clearPointerState,
            setPointerFromClient,
        });

        return {
            canvasRef,
            cursorRef,
            handlePointerDown,
            handlePointerEnter,
            handlePointerLeave,
            handlePointerMove,
            handlePointerUp,
            hostRef,
        };
    },
});
</script>

<style scoped>
.particulate-shell {
    position: relative;
    width: min(100%, 420px);
    aspect-ratio: 1;
    overflow: hidden;
    background: transparent;
    cursor: none;
}

.particulate-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
}

.particulate-cursor {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    width: 80px;
    height: 80px;
    margin: -40px 0 0 -40px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 165, 0, 0.38);
    background: rgba(255, 180, 70, 0.05);
    transition:
        width 0.3s,
        height 0.3s,
        margin 0.3s,
        border-color 0.3s,
        background 0.3s,
        opacity 0.2s;
}

.particulate-cursor.is-active {
    width: 94px;
    height: 94px;
    margin: -47px 0 0 -47px;
    border-color: rgba(255, 165, 0, 0.48);
    background: rgba(255, 180, 70, 0.08);
}

@media (max-width: 640px) {
    .particulate-shell {
        width: min(100%, 320px);
    }

    .particulate-cursor {
        width: 64px;
        height: 64px;
        margin: -32px 0 0 -32px;
    }

    .particulate-cursor.is-active {
        width: 76px;
        height: 76px;
        margin: -38px 0 0 -38px;
    }
}
</style>
