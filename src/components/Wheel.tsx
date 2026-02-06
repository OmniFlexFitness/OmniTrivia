import React, { useState, useEffect, useRef, useCallback } from "react";
import { CATEGORIES } from "../constants";
import { useGame } from "../context/GameContext";
import { Category } from "../types";
import Button from "./Button";
import { ArrowRight } from "lucide-react";

// Minimum velocity (deg/s) required to trigger a spin
const MIN_SPIN_VELOCITY = 800;
// Friction applied during deceleration
const FRICTION = 0.985;
// Minimum velocity to stop animation
const STOP_THRESHOLD = 0.5;

const Wheel: React.FC = () => {
  const { selectCategory, isHost, currentRound, totalRounds, roundsConfig } =
    useGame();

  // Core state
  const [rotation, setRotation] = useState(0);
  const [winningCategory, setWinningCategory] = useState<Category | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasValidSpin, setHasValidSpin] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const lastAngleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  // Get the target category for this round from config
  const targetCategoryConfig = roundsConfig[currentRound - 1];
  const targetCategory = targetCategoryConfig
    ? targetCategoryConfig.category
    : CATEGORIES[0];
  const activeCategories = CATEGORIES;

  // Calculate angle from center of wheel to mouse position
  const getAngleFromCenter = useCallback(
    (clientX: number, clientY: number): number => {
      if (!wheelRef.current) return 0;
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    },
    [],
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!isHost || winningCategory || isSpinning) return;

      // Cancel any running animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      setIsDragging(true);
      const angle = getAngleFromCenter(clientX, clientY);
      lastAngleRef.current = angle;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
    },
    [isHost, winningCategory, isSpinning, getAngleFromCenter],
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !isHost) return;

      const currentAngle = getAngleFromCenter(clientX, clientY);
      const currentTime = performance.now();

      // Calculate angle delta (handling wrap-around)
      let angleDelta = currentAngle - lastAngleRef.current;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;

      // Calculate time delta
      const timeDelta = (currentTime - lastTimeRef.current) / 1000; // seconds

      // Update velocity (degrees per second)
      if (timeDelta > 0) {
        velocityRef.current = angleDelta / timeDelta;
      }

      // Update rotation
      rotationRef.current += angleDelta;
      setRotation(rotationRef.current);

      lastAngleRef.current = currentAngle;
      lastTimeRef.current = currentTime;
    },
    [isDragging, isHost, getAngleFromCenter],
  );

  // Handle drag end - trigger spin if velocity threshold met
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const velocity = Math.abs(velocityRef.current);

    if (velocity >= MIN_SPIN_VELOCITY && !winningCategory) {
      // Valid spin! Trigger the spin animation
      setIsSpinning(true);
      setHasValidSpin(true);

      // Calculate target rotation to land on the rigged category
      const targetIndex = activeCategories.findIndex(
        (c) => c.id === targetCategory.id,
      );
      const sliceAngle = 360 / activeCategories.length;
      const targetSliceRotation = -(targetIndex * sliceAngle);

      // Add extra spins based on velocity
      const spinMultiplier = Math.min(Math.floor(velocity / 400), 8);
      const extraSpins = 360 * (3 + spinMultiplier);

      // Calculate final rotation
      const currentNormalized = rotationRef.current % 360;
      const finalRotation =
        rotationRef.current -
        currentNormalized +
        extraSpins +
        targetSliceRotation;

      rotationRef.current = finalRotation;
      setRotation(finalRotation);

      // Set winning category after animation completes
      setTimeout(() => {
        setIsSpinning(false);
        setWinningCategory(targetCategory);
      }, 3000);
    } else if (velocity > 0) {
      // Below threshold - gentle deceleration back to rest
      animateDeceleration();
    }
  }, [isDragging, winningCategory, activeCategories, targetCategory]);

  // Animate deceleration for sub-threshold spins
  const animateDeceleration = useCallback(() => {
    const animate = () => {
      velocityRef.current *= FRICTION;

      if (Math.abs(velocityRef.current) < STOP_THRESHOLD) {
        velocityRef.current = 0;
        animationFrameRef.current = null;
        return;
      }

      rotationRef.current += velocityRef.current * 0.016; // ~60fps
      setRotation(rotationRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    },
    [handleDragMove],
  );

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Attach global mouse/touch event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleContinue = () => {
    if (winningCategory) {
      selectCategory(winningCategory.id);
    }
  };

  // Determine wheel cursor and transition style
  const wheelStyle: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: isSpinning
      ? "transform 3s cubic-bezier(0.2, 0.8, 0.2, 1)"
      : isDragging
        ? "none"
        : "transform 0.1s ease-out",
    cursor:
      isHost && !winningCategory
        ? isDragging
          ? "grabbing"
          : "grab"
        : "default",
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center mb-8">
        <div className="inline-block px-4 py-1 bg-slate-800 rounded-full text-neon-blue font-mono text-sm mb-2 border border-slate-700">
          ROUND {currentRound} OF {totalRounds}
        </div>
        <h2 className="text-3xl font-bold text-white neon-text mb-2">
          CATEGORY SELECTION
        </h2>
        <div className="flex items-center justify-center gap-2 text-slate-400">
          {isHost ? (
            <span className="text-neon-pink font-bold">
              {winningCategory
                ? "Category selected!"
                : isSpinning
                  ? "Spinning..."
                  : "Drag the wheel to spin!"}
            </span>
          ) : (
            <span>Waiting for Host to spin...</span>
          )}
        </div>
      </div>

      <div className="relative w-80 h-80 md:w-96 md:h-96 select-none">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>

        {/* Wheel */}
        <div
          ref={wheelRef}
          className="w-full h-full rounded-full border-4 border-slate-700 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={wheelStyle}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {activeCategories.map((cat, index) => {
            const angle = 360 / activeCategories.length;
            const rotate = index * angle;
            return (
              <div
                key={cat.id}
                className={`absolute top-0 left-1/2 w-1/2 h-1/2 origin-bottom-left flex items-center justify-center ${cat.color}`}
                style={{
                  transform: `rotate(${rotate}deg) skewY(-${90 - angle}deg)`,
                }}
              >
                <div
                  className="absolute left-8 bottom-8 text-2xl transform flex flex-col items-center pointer-events-none"
                  style={{
                    transform: `skewY(${90 - angle}deg) rotate(${angle / 2}deg)`,
                  }}
                >
                  <span className="text-3xl drop-shadow-md mb-1">
                    {cat.icon}
                  </span>
                  <span className="text-xs font-bold uppercase text-white drop-shadow-md whitespace-nowrap">
                    {cat.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center Hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-slate-900 rounded-full border-4 border-white z-10 flex items-center justify-center shadow-lg pointer-events-none">
          <div
            className={`w-16 h-16 rounded-full ${winningCategory ? winningCategory.color : "bg-neon-pink"} flex items-center justify-center transition-colors`}
          >
            {winningCategory && (
              <span className="text-2xl">{winningCategory.icon}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 h-24 flex items-center justify-center w-full max-w-md">
        {winningCategory ? (
          <div className="flex flex-col items-center animate-bounce-short w-full">
            <div className="text-xl font-bold mb-4 text-white">
              Category:{" "}
              <span className="text-neon-blue text-2xl ml-2">
                {winningCategory.name}
              </span>
            </div>
            {isHost && (
              <Button
                onClick={handleContinue}
                variant="neon"
                fullWidth
                className="flex items-center justify-center gap-2"
              >
                START ROUND <ArrowRight size={20} />
              </Button>
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-sm text-center">
            {isHost
              ? isSpinning
                ? "The wheel is spinning..."
                : "Click and drag the wheel, then release with a flick!"
              : "Waiting for Host..."}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wheel;
