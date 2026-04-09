# EEG Neuroplay Web - Task TODO

## Current Task: Fix Correlation Matrix Size Mismatch (Delta 6x6 Error)

### Steps:
✅ 1. Updated js/correlation.js: matrixFromSpectrum() now returns {matrix, usedChannels} filtering valid spectra
✅ 2. Updated js/main.js: 
  - Added this.validLabels = corrResult.usedChannels in recomputeMatrixFromLastSpectrum
  - matrixLabels() prioritizes this.validLabels with fallback
  - updateCorrelationTable() uses dynamic labels, mismatch now only internal error
✅ 3. Code changes complete - Delta matrix will now render NxN using only valid channels (no size error)
✅ 4. CSV export uses same dynamic labels
✅ 5. Task completed successfully

## Task Complete 🎉

