import assert from 'assert';

console.log('🧪 Running Cropper & Coordinate Math Verification Tests...\n');

function computeCrop(rect, windowWidth, windowHeight, capturedWidth, capturedHeight) {
  const winW = windowWidth > 0 ? windowWidth : 1;
  const winH = windowHeight > 0 ? windowHeight : 1;
  const scaleX = capturedWidth / winW;
  const scaleY = capturedHeight / winH;

  let sx = Math.round(rect.left * scaleX);
  let sy = Math.round(rect.top * scaleY);
  let sWidth = Math.round(rect.width * scaleX);
  let sHeight = Math.round(rect.height * scaleY);

  sx = Math.max(0, Math.min(sx, capturedWidth - 1));
  sy = Math.max(0, Math.min(sy, capturedHeight - 1));
  sWidth = Math.max(1, Math.min(sWidth, capturedWidth - sx));
  sHeight = Math.max(1, Math.min(sHeight, capturedHeight - sy));

  return { sx, sy, sWidth, sHeight };
}

// Test 1: Standard 1080p, 100% zoom (1.0 DPR)
{
  const crop = computeCrop(
    { left: 100, top: 150, width: 800, height: 300 },
    1920, 1080,
    1920, 1080
  );
  assert.strictEqual(crop.sx, 100);
  assert.strictEqual(crop.sy, 150);
  assert.strictEqual(crop.sWidth, 800);
  assert.strictEqual(crop.sHeight, 300);
  console.log('✓ Test 1 Passed: Standard 1080p display (1.0x DPR)');
}

// Test 2: Retina / High-DPI display (2.0 DPR)
{
  const crop = computeCrop(
    { left: 200, top: 100, width: 400, height: 250 },
    1440, 900,
    2880, 1800
  );
  assert.strictEqual(crop.sx, 400);
  assert.strictEqual(crop.sy, 200);
  assert.strictEqual(crop.sWidth, 800);
  assert.strictEqual(crop.sHeight, 500);
  console.log('✓ Test 2 Passed: High-DPI / Retina 2.0x DPR scaling');
}

// Test 3: Fractional scaling (125% zoom or Windows 1.25x scaling)
{
  const crop = computeCrop(
    { left: 100, top: 80, width: 200, height: 100 },
    1280, 720,
    1600, 900 // 1280 * 1.25, 720 * 1.25
  );
  assert.strictEqual(crop.sx, 125);
  assert.strictEqual(crop.sy, 100);
  assert.strictEqual(crop.sWidth, 250);
  assert.strictEqual(crop.sHeight, 125);
  console.log('✓ Test 3 Passed: Fractional 1.25x scaling');
}

// Test 4: Selection touching right/bottom edge
{
  const crop = computeCrop(
    { left: 1800, top: 1000, width: 300, height: 200 },
    1920, 1080,
    1920, 1080
  );
  assert.strictEqual(crop.sx, 1800);
  assert.strictEqual(crop.sy, 1000);
  assert.strictEqual(crop.sWidth, 120); // Clamped to 1920 - 1800
  assert.strictEqual(crop.sHeight, 80); // Clamped to 1080 - 1000
  console.log('✓ Test 4 Passed: Boundary clamping at edge limits');
}

// Test 5: Selection at origin (0, 0)
{
  const crop = computeCrop(
    { left: 0, top: 0, width: 500, height: 200 },
    1920, 1080,
    1920, 1080
  );
  assert.strictEqual(crop.sx, 0);
  assert.strictEqual(crop.sy, 0);
  assert.strictEqual(crop.sWidth, 500);
  assert.strictEqual(crop.sHeight, 200);
  console.log('✓ Test 5 Passed: Selection at top-left origin');
}

console.log('\n🎉 All 5 coordinate scaling verification tests passed!\n');

