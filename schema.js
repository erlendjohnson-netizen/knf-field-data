/* Kisatchie Field & Lab Data — record definitions.
   Field keys follow the legacy Access/GeoPackage column names (Kisatchie.gpkg) wherever one exists,
   so exports drop straight into the existing tables. New fields are marked "new" in comments.
   Field types: text, int, num, date, time, select, combo (list + free text), bool, area, munsell, ro (computed). */

const LISTS = {
  district: ['Kisatchie RD', 'Caney RD', 'Winn RD', 'Catahoula RD', 'Evangeline Unit', 'Vernon Unit', 'Other'],
  _sites: [],
  mappoint_kind: ['Boundary', 'Site datum', 'Isolated find', 'Feature', 'Photo point', 'Landmark / road', 'Unit corner', 'Other'],
  _corners: [],
  record_kind: ['Previously recorded site', 'New site (temporary no.)', 'Survey area', 'Isolated find', 'Other investigation'],
  parish: ['Acadia', 'Allen', 'Ascension', 'Assumption', 'Avoyelles', 'Beauregard', 'Bienville', 'Bossier', 'Caddo', 'Calcasieu', 'Caldwell', 'Cameron', 'Catahoula', 'Claiborne', 'Concordia', 'De Soto', 'East Baton Rouge', 'East Carroll', 'East Feliciana', 'Evangeline', 'Franklin', 'Grant', 'Iberia', 'Iberville', 'Jackson', 'Jefferson', 'Jefferson Davis', 'La Salle', 'Lafayette', 'Lafourche', 'Lincoln', 'Livingston', 'Madison', 'Morehouse', 'Natchitoches', 'Orleans', 'Ouachita', 'Plaquemines', 'Pointe Coupee', 'Rapides', 'Red River', 'Richland', 'Sabine', 'St. Bernard', 'St. Charles', 'St. Helena', 'St. James', 'St. John the Baptist', 'St. Landry', 'St. Martin', 'St. Mary', 'St. Tammany', 'Tangipahoa', 'Tensas', 'Terrebonne', 'Union', 'Vermilion', 'Vernon', 'Washington', 'Webster', 'West Baton Rouge', 'West Carroll', 'West Feliciana', 'Winn', 'Outside Louisiana'],
  custody_action: ['Collected in field', 'Transferred', 'Placed in box', 'Removed from box', 'Received at lab', 'Checked out for analysis', 'Returned to storage', 'Sent to specialist', 'Curated'],
  excavation_type: ['STP', 'TP', 'Unit', 'Surface collection', 'Feature grouping'],
  su_size: ['Whole unit (one subunit)', '1 × 1 m', '0.5 × 1 m (E–W × N–S)', '1 × 0.5 m (E–W × N–S)', '0.5 × 0.5 m', '2 × 2 m'],
  datum_corner: ['SW corner', 'SE corner', 'NW corner', 'NE corner'],
  role: ['PI / Co-PI', 'Project staff', 'Field director / crew chief', 'Student', 'USFS staff', 'Volunteer', 'Lab staff', 'Other'],
  excavation_method: ['Shovel', 'Flat shovel', 'Round shovel', 'Shovel/Trowel', 'Trowel', 'Surface', 'Auger/Core', 'Not excavated'],
  screen: ['1/4 in', '1/8 in', '1/16 in (water)', 'Not screened'],
  soil_texture: ['Sand', 'Loamy sand', 'Sandy loam', 'Loam', 'Silt loam', 'Silt', 'Sandy clay loam', 'Clay loam',
    'Silty clay loam', 'Sandy clay', 'Silty clay', 'Clay', 'Gravel/Gravelly', 'Fill/Disturbed'],
  strata: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'],
  ynu: ['Yes', 'No', 'Uncertain'],
  feature_type: ['Stain', 'Pit', 'Posthole', 'Possible posthole', 'Hearth', 'Midden', 'Burned area', 'Tree burn/disturbance', 'Rodent burrow', 'Other'],
  sample_type: ['Radiocarbon (AMS)', 'OSL', 'Flotation', 'Soil/sediment', 'Pollen', 'Phytolith', 'Other'],
  sample_material: ['Charcoal', 'Wood', 'Nutshell', 'Seed', 'Bone', 'Pottery residue', 'Sediment', 'Other'],
  osl_collection: ['Core (tube)', 'Bag (dark sample)'],
  bag_contents: ['Prehistoric artifacts', 'Special find', 'Historic artifacts', 'Mixed artifacts', 'Lithics', 'Ceramics', 'FCR', 'Bone', 'Charcoal', 'Sample', 'Other'],
  // lithics
  tool_type: ['Biface (Hafted)', 'Biface (Unhafted)', 'Biface Fragment', 'Biface Preform', 'Scraper', 'Drill',
    'Bifacial Flake Tool', 'Unifacial Flake Tool', 'Blade', 'Core', 'Hammerstone', 'Special', 'Unknown'],
  material_class: ['Chert, Unspecified', 'Citronelle Gravel', 'Eagle Hill Chert', 'Novaculite', 'Quartzite',
    'Tallahatta Quartzite', 'Petrified Wood', 'Petrified Palm Wood', 'Quartz', 'Edwards Plateau Chert', 'Boone Chert',
    'Burlington/Crescent City Chert', 'Dover Chert', 'Dongola Chert', 'Fort Hood Chert', 'Pedernales Chert', 'Sandstone', 'Indeterminate'],
  sourcing_basis: ['Visual (class only)', 'Visual (diagnostic: novaculite/quartzite)', 'pXRF', 'Other analysis'],
  portion: ['Complete', 'Complete tool from reworked fragment', 'Proximal, complete base and >1/2 blade', 'Proximal, base only',
    'Distal, >1/2 blade', 'Distal, <1/2 blade', 'Lateral portion of blade and base', 'Lateral portion of blade, no base',
    'Medial', 'Indeterminate fragment'],
  flaking_style: ['Random', 'Horizontal Transverse', 'Collateral with Median Ridge', 'Indeterminate'],
  shoulder: ['Barbed', 'Horizontal', 'Tapered', 'Inversely Tapered', 'Weak or Narrow', 'Rounded', 'Recurved', 'Hooked', 'Acute', 'Drooping Wing', 'Expanded/Broad'],
  stem: ['Straight', 'Expanding', 'Contracting', 'Excurvate', 'Incurvate', 'Pointed', 'Beveled', 'Ground', 'Bifurcated'],
  base: ['Straight', 'Concave', 'Convex', 'Excurvate', 'Incurvate', 'Fluted'],
  thinning: ['Bifacial', 'Unifacial', 'Multifacial'],
  edge_shape: ['Straight', 'Excurvate', 'Incurvate', 'Serrated', 'Beveled', 'Smooth', 'Irregular'],
  notching: ['Side Notched', 'Corner Notched', 'Basal Notched', 'None', 'Indeterminate'],
  cortex_stage: ['Primary (90-100%)', 'Secondary (1-89%)', 'Tertiary (0%)'],
  pa: ['Present', 'Absent'],
  debitage_type: ['Primary Flake', 'Secondary Flake', 'Tertiary Flake', 'Shatter', 'Utilized Flake', 'Core', 'Microflake', 'Other'],
  point_type: ['Agee', 'Alba', 'Angustura', 'Bassett', 'Bayougoula', 'Big Sandy/Early Side-Notched', 'Birds Creek Cluster', 'Bonham',
    'Bulverde', 'Calcasieu', 'Calf Creek', 'Carrollton', 'Castroville', 'Catahoula', 'Cliffton', 'Clovis', 'Colbert', 'Cuney', 'Dalton',
    'Darl', 'Delhi', 'Dooley Branch Cluster', 'Edgewood', 'Edwards', 'Elam', 'Ellis', 'Ensor', 'Epps', 'Evans', 'Fairland', 'Figueroa',
    'Fresno', 'Friley', 'Gary', 'Godley', 'Guerrero', 'Hayes', 'Homan', 'Kent', 'Kirk Corner-Notched', 'Lange', 'Ledbetter', 'Livermore',
    'Lone Oak', 'Lowe', 'Macon', 'Marcos', 'Marshall', 'Martindale', 'Maud', 'Morhiss', 'Morrill', 'Motley', 'Neches River', 'Nolan',
    'Palmer', 'Palmillas', 'Pelican', 'Perdiz', 'Plainview/Other Paleoindian Point', 'Pontchartrain', 'Rockwall/St. Marion',
    'San Patrice, var. Dixon', 'San Patrice, var. Geniell', 'San Patrice, var. Hope', 'San Patrice, var. Keithville',
    'San Patrice, var. St. Johns', 'Scallorn', 'Scottsbluff', 'Shumla', 'Sinner', 'Steiner', 'Summerfield', 'Trinity', 'Wade', 'Wells',
    'Williams', 'Woden', 'Yarbrough', 'Indeterminate'],
  // ceramics
  ceramic_type: ['Baytown Plain, var. Unknown', 'Baytown Plain, var. Troyville', 'Mississippi Plain, var. Unknown', 'Bell Plain, var. Unknown',
    'Unspecified Plain', 'Avoyelles Punctated, var. Avoyelles', 'Avoyelles Punctated, var. Unknown', 'Beldeau Incised, var. Beldeau',
    'Beldeau Incised, var. Bell Bayou', 'Caddo Incised, var. Unknown', 'Catahoula Zoned Red, var. Catahoula', 'Churupa Punctated, var. Churupa',
    'Churupa Punctated, var. Unknown', 'Coleman Incised, var. Unknown', 'Coles Creek Incised, var. Blakely', 'Coles Creek Incised, var. Campbellsville',
    'Coles Creek Incised, var. Coles Creek', 'Coles Creek Incised, var. Greenhouse', 'Coles Creek Incised, var. Hardy', 'Coles Creek Incised, var. Hunt',
    'Coles Creek Incised, var. Mott', 'Coles Creek Incised, var. Phillips', 'Coles Creek Incised, var. Stoner', 'Coles Creek Incised, var. Unknown',
    'Evansville Punctate, var. Braxton', 'Evansville Punctate, var. Evansville', 'Evansville Punctate, var. Rhinehart', 'Evansville Punctate, var. Sharkey',
    'Evansville Punctate, var. Unknown', 'Foster Trailed-Incised, var. Unknown', 'French Fork Incised, var. Iberville', 'French Fork Incised, var. Laborde',
    'French Fork Incised, var. Larkin', 'French Fork Incised, var. McNutt', 'French Fork Incised, var. Unknown', 'Harrison Bayou Incised, var. Harrison Bayou',
    'Harrison Bayou Incised, var. Unknown', 'Hollyknowe Pinched, var. Hollyknowe', 'Jaketown Simple Stamped, var. Jaketown', 'Karnack Brushed Incised, var. Unknown',
    'Leland Incised, var. Unknown', 'Marksville Incised, var. Marksville', 'Marksville Incised, var. Steele Bayou', 'Marksville Incised, var. Unknown',
    'Mazique Incised, var. Bruly', 'Mazique Incised, var. Kingspoint', 'Mazique Incised, var. Manchac', 'Mazique Incised, var. Mazique',
    'Mazique Incised, var. Unknown', 'Parkin Punctated, var. Unknown', 'Plaquemine Brushed, var. Blackwater', 'Plaquemine Brushed, var. Plaquemine',
    'Plaquemine Brushed, var. Unknown', 'Indeterminate'],
  sherd_type: ['Body', 'Rim', 'Base', 'Handle', 'Lid', 'Indeterminate'],
  vessel_class: ['Bowl', 'Jar', 'Plate', 'Bottle', 'Beaker', 'Other', 'Indeterminate'],
  completeness: ['Fragments', '1-24%', '25-49%', '50-74%', '75-99%', 'Complete Vessel'],
  condition: ['Good', 'Moderate', 'Poor'],
  paste_color: ['Buff/Tan', 'Grey', 'Black', 'Red', 'White', 'Mottled'],
  firing_technique: ['Oxidized', 'Reduced', 'Undetermined'],
  temper: ['Grog', 'Sand', 'Grog and Sand', 'Shell', 'Bone', 'Grit', 'Organics', 'Hematite', 'Clay', 'Temperless', 'Unidentifiable'],
  decoration: ['Plain', 'Incised', 'Curvilinear Incised', 'Punctate', 'Fingernail Punctate', 'Punctate-Incised', 'Zoned-Incised Punctate',
    'Brushed', 'Brushed-Incised', 'Engraved', 'Stamped', 'Cord Marked', 'Red Filmed', 'Ridged', 'Indeterminate'],
  lip_type: ['Rounded', 'Flattened', 'Squared', 'Angular', 'Beveled', 'Peaked', 'Inverted', 'Folded'],
  // ground stone / historic
  gs_type: ['Mano', 'Metate', 'Hammerstone', 'Nutting stone', 'Abrader', 'Pitted stone', 'Other'],
  gs_material: ['Sandstone', 'Quartzite', 'Sandstone with Quartzite', 'Conglomerate', 'Chert', 'Ironstone', 'Other'],
  texture: ['Smooth', 'Rough', 'Smooth/Rough'],
  hist_material: ['Ceramic', 'Glass', 'Metal', 'Brick', 'Bone', 'Leather', 'Plastic', 'Other'],
  hist_type: ['Whiteware', 'Pearlware', 'Annular ware', 'Porcelain', 'Stoneware', 'Hand-painted ware', 'Transfer-printed ware',
    'Bottle glass', 'Flat glass', 'Cut nail', 'Machine cut nail', 'Wire nail', 'Staple', 'Unidentified iron', 'Button', 'Brick', 'Other'],
  glass_color: ['Clear', 'Aqua', 'Green', 'Amber', 'Olive', 'Cobalt', 'Solarized/Amethyst', 'Milk', 'Other'],
};

/* parent: what a record hangs under. mode: field or lab (controls where it appears). */
const TABLES = {
  sites: {
    label: 'Site or work area', plural: 'Sites & work areas', parent: null, mode: 'field', legacy: 'sites',
    title: r => r.sitename || '(new site)',
    fields: [
      { k: 'record_kind', l: 'Kind', t: 'select', o: 'record_kind', req: 1 },
      { k: '_gps', l: 'Location (site datum or centre): take this first, it fills in the district, parish and quad', t: 'gps', w: 3 },
      { k: 'district', l: 'District', t: 'select', o: 'district', req: 1 },
      { k: 'sitename', l: 'Site number / designation', t: 'combo', o: '_sites', req: 1, ph: '16NA41, KRD-T01 or KRD-S01', help: 'Pick from the KNF site list. New sites (KRD-T01) and survey areas (KRD-S01) are numbered automatically; put in the trinomial once the state assigns it' },
      { k: 'site_name', l: 'Name (optional)', t: 'text', ph: 'e.g. Bayou Toro ridge survey' },
      { k: 'temp_name', l: 'Temporary designation (kept)', t: 'ro', show: r => !!r.temp_name },
      { k: 'requested_by', l: 'Requested by', t: 'text', ph: 'e.g. Matt Helmer', show: r => r.record_kind === 'Other investigation' },
      { k: 'parish', l: 'Parish', t: 'select', o: 'parish', help: 'Filled in from the GPS position' },
      { k: 'usgsquad', l: 'USGS quad', t: 'select', o: 'quad', help: 'Filled in from the GPS position; leave “Unknown” if it isn’t listed' },
      { k: 'site_code', l: 'ID code (6 digits)', t: 'text', req: 1, ph: '530041', help: 'Filled in automatically: parish no. + site no. (16NA41 → 530041). Used to build excavation IDs, so it must be unique.' },
      { k: 'project', l: 'Project', t: 'ro' },
      { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
  excavations: {
    label: 'Excavation', plural: 'Excavations (STPs, units)', parent: 'sites', mode: 'field', legacy: 'excavations',
    title: r => r.excavation_name || ((r.excavation_type || '') + ' ' + (r.seq || '')),
    fields: [
      { k: 'excavation_type', l: 'Type', t: 'select', o: 'excavation_type', req: 1 },
      { k: 'excavation_name', l: 'Name', t: 'text', req: 1, ph: 'STP 12 / TU1', help: 'As written on the bag and field map' },
      { k: 'seq', l: 'Sequence no.', t: 'int', req: 1, help: '1-99, unique per site and type' },
      { k: 'excavationid', l: 'Excavation ID', t: 'ro' },
      { k: 'transect', l: 'Transect', t: 'text' }, // new
      { k: 'date', l: 'Date', t: 'date', req: 1 }, // new
      { k: 'crew', l: 'Excavators', t: 'text' }, // new
      { k: '_gps', l: 'Location (for units: the unit datum)', t: 'gps', w: 3 },
      { k: 'unit_ew', l: 'Unit size E–W (m)', t: 'num', virtual: 1, newOnly: 1, show: r => isUnit(r), help: 'Whole unit, e.g. 1, 2' },
      { k: 'unit_ns', l: 'Unit size N–S (m)', t: 'num', virtual: 1, newOnly: 1, show: r => isUnit(r) },
      { k: 'su_size', l: 'Split into subunits of', t: 'select', o: 'su_size', virtual: 1, newOnly: 1, show: r => isUnit(r), help: 'The subunits are laid out and lettered for you (A at the datum). Expansions can be added later on the unit page.' },
      { k: 'datum_corner', l: 'Datum stake is at the unit’s', t: 'select', o: 'datum_corner', virtual: 1, newOnly: 1, show: r => isUnit(r) },
      { k: 'datum_desc', l: 'Datum stake (description)', t: 'text', w: 2, ph: 'Wooden stake at SW corner of A', show: r => isUnit(r) },
      { k: 'azimuth', l: 'Unit orientation (° the unit’s north wall faces)', t: 'num', show: r => isUnit(r), help: 'Which way the unit is turned. 0 = walls run straight N–S and E–W. If the unit was laid out turned, enter the compass bearing its “north” wall faces (e.g. 15). The app uses it to draw the unit and its subunits in the right place on the maps. Not sure? Leave 0 and shoot a corner with the GPS on the unit page: the app works it out.' },
      { k: 'positive', l: 'Positive?', t: 'bool' },
      { k: 'depthcm', l: 'Final depth (cmbs)', t: 'num' },
      { k: 'depthsterile', l: 'Depth to sterile (cmbs)', t: 'num' },
      { k: 'strata', l: 'No. of strata', t: 'int' },
      { k: 'lengthcm', l: 'Length (cm)', t: 'num', show: r => !isUnit(r) },
      { k: 'widthcm', l: 'Width (cm)', t: 'num', show: r => !isUnit(r) },
      { k: 'number_of_eu', l: 'No. of subunits', t: 'ro', show: r => isUnit(r) },
      { k: 'feature', l: 'Feature present', t: 'bool' },
      { k: 'dateablematerial', l: 'Dateable material', t: 'bool' },
      { k: 'not_excavated_reason', l: 'Not excavated / truncated because', t: 'text', w: 2 }, // new
      { k: 'photos', l: 'Photo nos.', t: 'text' }, // new
      { k: 'plan_drawing_1', l: 'Plan drawing', t: 'text' },
      { k: 'profile_drawing_1', l: 'Profile drawing', t: 'text' },
      { k: 'comments', l: 'Comments', t: 'area', w: 3 },
    ],
  },
  levels: {
    label: 'Level', plural: 'Levels', parent: 'excavations', mode: 'field', legacy: 'levels',
    title: r => `EU ${r.excavation_unit || 'A'} · Level ${r.levelno ?? '?'} (${r.top_cm ?? '?'}–${r.bgscm ?? '?'} cm)`,
    fields: [
      { k: 'bag_qr', l: 'Bag label (scanned before starting)', t: 'qr', w: 3, virtual: 1, newOnly: 1, show: r => !!r.bag_qr },
      { k: 'excavation_unit', l: 'EU', t: 'text', req: 1, ph: 'A' },
      { k: 'levelno', l: 'Level no.', t: 'int', req: 1 },
      { k: 'levelid', l: 'Level ID', t: 'ro' },
      { k: 'top_cm', l: 'Top (cmbs)', t: 'num', req: 1 }, // new
      { k: 'bgscm', l: 'Bottom (cmbs)', t: 'num', req: 1 },
      { k: 'excdepth', l: 'Thickness (cm)', t: 'ro' },
      { k: 'volume_l', l: 'Volume (L, from area × thickness)', t: 'ro' },
      { k: 'excavation_method', l: 'Method', t: 'select', o: 'excavation_method' },
      { k: 'screen', l: 'Screen', t: 'select', o: 'screen' }, // new
      { k: 'munsell', l: 'Munsell', t: 'munsell', ph: '10YR 4/3' },
      { k: 'munsell2', l: 'Munsell (mottle/2nd)', t: 'munsell', ph: '10YR 6/6' }, // new
      { k: 'soil_texture', l: 'Soil texture', t: 'combo', o: 'soil_texture' },
      { k: 'strata', l: 'Stratum', t: 'combo', o: 'strata' },
      { k: 'artifacts', l: 'Artifacts recovered', t: 'bool' },
      { k: 'field_count', l: 'Field artifact count', t: 'int', show: r => !!r.artifacts, help: 'Count at the screen (lab counts are authoritative). In a survey area, more than 5 in one STP makes a new site.' }, // new
      { k: 'soil_change', l: 'Soil change', t: 'bool' },
      { k: 'feature', l: 'Feature', t: 'bool' },
      { k: 'special_find', l: 'Special find', t: 'bool' },
      { k: 'special_find_desc', l: 'Special find: what it is, where and depth', t: 'area', w: 3, ph: 'e.g. Gary point, base intact, NE quad of A at 34 cmbs, in situ', show: r => !!r.special_find },
      { k: 'terminal_level', l: 'Terminal level', t: 'bool' },
      { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
  bags: {
    label: 'Bag', plural: 'Bags', parent: 'levels', mode: 'field', legacy: null,
    title: r => `Bag ${r.bag_no ?? '?'} · ${r.contents || ''}`,
    fields: [
      { k: 'qr', l: 'Bag label (QR)', t: 'qr', req: 1, w: 2 },
      { k: 'bag_no', l: 'Bag / FS no.', t: 'int', req: 1 },
      { k: 'contents', l: 'Contents', t: 'select', o: 'bag_contents' },
      { k: 'field_count', l: 'Count (field)', t: 'int' },
      { k: 'date', l: 'Date', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'text', w: 2 },
    ],
  },
  features: {
    label: 'Feature', plural: 'Features', parent: 'excavations', mode: 'field', legacy: 'features_db',
    title: r => `Feature ${r.featurnumbersite ?? '?'} · ${r.feature_type || ''}`,
    fields: [
      { k: 'featurnumbersite', l: 'Feature no. (site)', t: 'int', req: 1 },
      { k: 'feature_type', l: 'Type', t: 'combo', o: 'feature_type' },
      { k: 'excavation_unit', l: 'EU', t: 'text' },
      { k: 'levelno', l: 'Level origin', t: 'int' },
      { k: 'depth_bgs', l: 'Top (cmbs)', t: 'num' },
      { k: 'bottom_bgs', l: 'Bottom (cmbs)', t: 'num' }, // new
      { k: 'length_cm', l: 'Length (cm)', t: 'num' }, // new
      { k: 'width_cm', l: 'Width (cm)', t: 'num' }, // new
      { k: 'munsell', l: 'Fill Munsell', t: 'munsell' }, // new
      { k: 'cultural', l: 'Cultural?', t: 'select', o: 'ynu' },
      { k: 'soil_sample_taken', l: 'Soil sample taken', t: 'bool' },
      { k: 'carbon_sample', l: 'Carbon sample taken', t: 'bool' },
      { k: 'drawing', l: 'Drawing no.', t: 'text' },
      { k: 'photo', l: 'Photo nos.', t: 'text' },
      { k: 'description', l: 'Description', t: 'area', w: 3 },
    ],
  },
  samples: {
    label: 'Sample', plural: 'Samples (C14, OSL, flotation…)', parent: 'excavations', mode: 'field', legacy: 'carbon_samples / osl_samples',
    title: r => `${r.sample_type || 'Sample'} ${r.sample_number ?? ''}`,
    fields: [
      { k: 'sample_type', l: 'Sample type', t: 'select', o: 'sample_type', req: 1 },
      { k: 'sample_number', l: 'Sample no.', t: 'int', req: 1 },
      { k: 'excavation_unit', l: 'EU', t: 'text' },
      { k: 'levelno', l: 'Level', t: 'int' },
      { k: 'depth', l: 'Depth (cmbs)', t: 'num' },
      { k: 'lower_bgs', l: 'Lower depth (cmbs)', t: 'num' },
      { k: 'material', l: 'Material', t: 'select', o: 'sample_material' },
      { k: 'collection', l: 'OSL collection', t: 'select', o: 'osl_collection', show: r => r.sample_type === 'OSL' },
      { k: 'volume_l', l: 'Volume (L)', t: 'num', show: r => r.sample_type === 'Flotation' || r.sample_type === 'Soil/sediment' },
      { k: 'weight', l: 'Weight (g)', t: 'num' },
      { k: 'feature_no', l: 'Feature no.', t: 'int' },
      { k: 'context', l: 'Context', t: 'text', w: 2 },
      { k: 'lab', l: 'Lab / lab no.', t: 'text' },
      { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },

  /* ---------------- LAB ---------------- */
  tabulation: {
    label: 'Level tabulation', plural: 'Level tabulation (counts & weights)', parent: 'levels', mode: 'lab', legacy: 'artifacts_detail', single: true,
    title: r => `Tabulation · ${r.artifact_count ?? 0} artifacts, ${r.artifactwght ?? 0} g`,
    fields: [
      { k: 'labtech', l: 'Lab tech', t: 'text' },
      { k: 'primaryflakect', l: 'Primary flakes n', t: 'int', g: 'Debitage' }, { k: 'primaryfakewghtg', l: 'g', t: 'num' },
      { k: 'secondaryflakect', l: 'Secondary flakes n', t: 'int' }, { k: 'secondaryflakwght', l: 'g', t: 'num' },
      { k: 'tertiaryflakect', l: 'Tertiary flakes n', t: 'int' }, { k: 'tertiaryflakwght', l: 'g', t: 'num' },
      { k: 'shatter', l: 'Shatter n', t: 'int' }, { k: 'shatterwght', l: 'g', t: 'num' },
      { k: 'utlzdflkct', l: 'Utilized flakes n', t: 'int' }, { k: 'utlzdflkwgt', l: 'g', t: 'num' },
      { k: 'corecnt', l: 'Cores n', t: 'int' }, { k: 'corwght', l: 'g', t: 'num' },
      { k: 'tstcobblect', l: 'Tested cobbles n', t: 'int' }, { k: 'tstcobblewght', l: 'g', t: 'num' },
      { k: 'diagnosticlithicsct', l: 'Diagnostic lithics n', t: 'int' }, { k: 'diagnosticlithicswght', l: 'g', t: 'num' },
      { k: 'fcrcount', l: 'FCR n', t: 'int', g: 'Other prehistoric' }, { k: 'fcrwght', l: 'g', t: 'num' },
      { k: 'grndstnct', l: 'Ground stone n', t: 'int' }, { k: 'grndstnwght', l: 'g', t: 'num' },
      { k: 'plainsherdct', l: 'Plain body sherds n', t: 'int', g: 'Ceramics' }, { k: 'plainsherdwght', l: 'g', t: 'num' },
      { k: 'plnsherdrimct', l: 'Plain rims n', t: 'int' }, { k: 'plnsherdrimwght', l: 'g', t: 'num' },
      { k: 'decsherdct', l: 'Decorated body sherds n', t: 'int' }, { k: 'decsherdwght', l: 'g', t: 'num' },
      { k: 'decsherdrimct', l: 'Decorated rims n', t: 'int' }, { k: 'decsherdrimwght', l: 'g', t: 'num' },
      { k: 'diagnosticcermct', l: 'Diagnostic ceramics n', t: 'int' }, { k: 'diagnosticceramwght', l: 'g', t: 'num' },
      { k: 'historicct', l: 'Historic items n', t: 'int', g: 'Historic' }, { k: 'historicwght', l: 'g', t: 'num' }, // new
      { k: 'debitage_count', l: 'Debitage total n', t: 'ro', g: 'Totals' },
      { k: 'artifact_count', l: 'Artifact total n', t: 'ro' },
      { k: 'artifactwght', l: 'Artifact total g', t: 'ro' },
      { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
  lithic_tools: {
    label: 'Lithic tool', plural: 'Lithic tools & points', parent: 'levels', mode: 'lab', legacy: 'lithic_tools', catalog: 1,
    title: r => `Cat. ${r.catalogno ?? '?'} · ${r.tool_type || ''}${r.point_type ? ' · ' + r.point_type : ''}`,
    fields: [
      { k: 'catalogno', l: 'Catalog no.', t: 'int', req: 1 },
      { k: 'labtech', l: 'Lab tech', t: 'text' },
      { k: 'tool_type', l: 'Tool type', t: 'select', o: 'tool_type', req: 1 },
      { k: 'point_type', l: 'Point type', t: 'combo', o: 'point_type' },
      { k: 'portion', l: 'Portion', t: 'select', o: 'portion' },
      { k: 'material_class', l: 'Raw material', t: 'combo', o: 'material_class' },
      { k: 'sourcing_basis', l: 'Material ID basis', t: 'select', o: 'sourcing_basis', help: 'Named sources only for novaculite, distinctive quartzites, or pXRF' }, // new
      { k: 'cnt', l: 'Count', t: 'int' }, { k: 'wt', l: 'Weight (g)', t: 'num' },
      { k: 'mlen', l: 'Max length (mm)', t: 'num', g: 'Metrics' }, { k: 'maxwid', l: 'Max width (mm)', t: 'num' }, { k: 'maxthk', l: 'Max thickness (mm)', t: 'num' },
      { k: 'bladelen', l: 'Blade length', t: 'num' }, { k: 'bladewid', l: 'Blade width', t: 'num' }, { k: 'haftlen', l: 'Haft length', t: 'num' },
      { k: 'neckwid', l: 'Neck width', t: 'num' }, { k: 'neckhgt', l: 'Neck height', t: 'num' }, { k: 'basewid', l: 'Base width', t: 'num' },
      { k: 'shoulder2corner', l: 'Shoulder to corner', t: 'num' },
      { k: 'flaking_style', l: 'Flaking style', t: 'select', o: 'flaking_style', g: 'Attributes' },
      { k: 'shoulder', l: 'Shoulder', t: 'select', o: 'shoulder' }, { k: 'stem', l: 'Stem', t: 'select', o: 'stem' },
      { k: 'base', l: 'Base', t: 'select', o: 'base' }, { k: 'notching', l: 'Notching', t: 'select', o: 'notching' },
      { k: 'thinning', l: 'Thinning', t: 'select', o: 'thinning' }, { k: 'basal_thinning', l: 'Basal thinning', t: 'bool' },
      { k: 'edge_shape', l: 'Edge shape', t: 'select', o: 'edge_shape' }, { k: 'cortex_stage', l: 'Cortex', t: 'select', o: 'cortex_stage' },
      { k: 'retpcnt', l: 'Retouch', t: 'select', o: 'pa' }, { k: 'color1', l: 'Color 1', t: 'text' }, { k: 'color2', l: 'Color 2', t: 'text' },
      { k: 'patina', l: 'Patina', t: 'bool' }, { k: 'heat', l: 'Heat treated/altered', t: 'bool' }, { k: 'usewear', l: 'Use-wear', t: 'bool' },
      { k: 'excavator_damage', l: 'Excavator damage', t: 'bool' },
      { k: 'photo', l: 'Photo / scan ID', t: 'text' }, { k: 'discarded', l: 'Discarded', t: 'bool' }, { k: 'missing', l: 'Missing', t: 'bool' },
      { k: 'comments', l: 'Comments', t: 'area', w: 3 },
    ],
  },
  prehistoric_ceramics: {
    label: 'Ceramic', plural: 'Prehistoric ceramics', parent: 'levels', mode: 'lab', legacy: 'prehistoric_ceramics', catalog: 1,
    title: r => `Cat. ${r.catalogno ?? '?'} · ${r.type_name || ''} · ${r.cnt ?? ''}`,
    fields: [
      { k: 'catalogno', l: 'Catalog no.', t: 'int', req: 1 },
      { k: 'labtech', l: 'Lab tech', t: 'text' },
      { k: 'type_name', l: 'Type, variety', t: 'combo', o: 'ceramic_type', req: 1, w: 2 },
      { k: 'sherd_type', l: 'Sherd', t: 'select', o: 'sherd_type' },
      { k: 'vessel_class', l: 'Vessel', t: 'select', o: 'vessel_class' },
      { k: 'cnt', l: 'Count', t: 'int', req: 1 }, { k: 'wt', l: 'Weight (g)', t: 'num' },
      { k: 'temper', l: 'Temper', t: 'select', o: 'temper' },
      { k: 'decoration1', l: 'Decoration 1', t: 'select', o: 'decoration' }, { k: 'decoration2', l: 'Decoration 2', t: 'select', o: 'decoration' },
      { k: 'paste_color', l: 'Paste color', t: 'select', o: 'paste_color' }, { k: 'firing_technique', l: 'Firing', t: 'select', o: 'firing_technique' },
      { k: 'completeness', l: 'Completeness', t: 'select', o: 'completeness' }, { k: 'condition', l: 'Condition', t: 'select', o: 'condition' },
      { k: 'lip_type', l: 'Lip', t: 'select', o: 'lip_type' }, { k: 'orifice_diameter', l: 'Orifice diam. (cm)', t: 'num' },
      { k: 'polished', l: 'Polished', t: 'bool' }, { k: 'excavator_damage', l: 'Excavator damage', t: 'bool' },
      { k: 'discarded', l: 'Discarded', t: 'bool' }, { k: 'missing', l: 'Missing', t: 'bool' },
      { k: 'comments', l: 'Comments', t: 'area', w: 3 },
    ],
  },
  exotic_lithics: {
    label: 'Debitage material', plural: 'Debitage by raw material', parent: 'levels', mode: 'lab', legacy: 'exotic_lithics',
    title: r => `${r.tooltype || ''} · ${r.raw_material || ''} · ${r.cnt ?? 1}`,
    fields: [
      { k: 'tooltype', l: 'Class', t: 'select', o: 'debitage_type', req: 1 },
      { k: 'raw_material', l: 'Raw material', t: 'combo', o: 'material_class', req: 1 },
      { k: 'sourcing_basis', l: 'Material ID basis', t: 'select', o: 'sourcing_basis' },
      { k: 'heat', l: 'Heat treated', t: 'bool' },
      { k: 'cnt', l: 'Count', t: 'int' }, { k: 'weight', l: 'Weight (g)', t: 'num' },
      { k: 'color', l: 'Color', t: 'text' }, { k: 'notes', l: 'Notes', t: 'text', w: 2 },
    ],
  },
  ground_stone: {
    label: 'Ground stone', plural: 'Ground stone', parent: 'levels', mode: 'lab', legacy: 'ground_stone', catalog: 1,
    title: r => `Cat. ${r.catalog_number ?? '?'} · ${r.artifact_type || ''}`,
    fields: [
      { k: 'catalog_number', l: 'Catalog no.', t: 'int', req: 1 },
      { k: 'artifact_type', l: 'Type', t: 'select', o: 'gs_type', req: 1 },
      { k: 'raw_material', l: 'Material', t: 'combo', o: 'gs_material' },
      { k: 'texture', l: 'Texture', t: 'select', o: 'texture' },
      { k: 'length', l: 'Length (mm)', t: 'num' }, { k: 'width', l: 'Width (mm)', t: 'num' }, { k: 'thickness', l: 'Thickness (mm)', t: 'num' },
      { k: 'weight', l: 'Weight (g)', t: 'num' }, { k: 'photo', l: 'Photo', t: 'text' }, { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
  historic_artifacts: {
    label: 'Historic artifact', plural: 'Historic artifacts', parent: 'levels', mode: 'lab', legacy: 'historic_artifacts', catalog: 1,
    title: r => `Cat. ${r.catalogn ?? '?'} · ${r.artifact_type || ''} · ${r.cnt ?? 1}`,
    fields: [
      { k: 'catalogn', l: 'Catalog no.', t: 'int', req: 1 },
      { k: 'material', l: 'Material', t: 'select', o: 'hist_material', req: 1 },
      { k: 'artifact_type', l: 'Type', t: 'combo', o: 'hist_type', req: 1 },
      { k: 'color_1', l: 'Color', t: 'combo', o: 'glass_color' },
      { k: 'decoration_type', l: 'Decoration', t: 'text' },
      { k: 'cnt', l: 'Count', t: 'int' }, { k: 'weight', l: 'Weight (g)', t: 'num' },
      { k: 'length', l: 'Length (mm)', t: 'num' }, { k: 'width', l: 'Width (mm)', t: 'num' },
      { k: 'date', l: 'Date / TPQ', t: 'text', ph: 'e.g. 1890' }, { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
  flotation: {
    label: 'Flotation/water-screen', plural: 'Flotation & water screening', parent: 'levels', mode: 'lab', legacy: 'flotation_water_screening',
    title: r => `Flotation · ${r.volomel ?? '?'} ml`,
    fields: [
      { k: 'volomel', l: 'Volume (ml)', t: 'num' },
      { k: 'primaryflakect', l: 'Primary flakes n', t: 'int' }, { k: 'primaryflakewgt', l: 'g', t: 'num' },
      { k: 'secondaryflakect', l: 'Secondary flakes n', t: 'int' }, { k: 'seconaryflakewgt', l: 'g', t: 'num' },
      { k: 'tertiaryflakect', l: 'Tertiary flakes n', t: 'int' }, { k: 'tertiaryflakwgt', l: 'g', t: 'num' },
      { k: 'microlithct', l: 'Microdebitage n', t: 'int' }, { k: 'microlithwgt', l: 'g', t: 'num' },
      { k: 'shatterct', l: 'Shatter n', t: 'int' }, { k: 'shatterwgt', l: 'g', t: 'num' },
      { k: 'fcrct', l: 'FCR n', t: 'int' }, { k: 'fcrwgt', l: 'g', t: 'num' },
      { k: 'pottery', l: 'Pottery n', t: 'int' }, { k: 'potterywght', l: 'g', t: 'num' },
      { k: 'sent_for_analysis', l: 'Sent for analysis', t: 'bool' }, { k: 'notes', l: 'Notes', t: 'area', w: 3 },
    ],
  },
};

/* Units are recorded as subunits laid out around the unit datum, in metres on the unit's own grid
   (x = east along the unit grid, y = north). A subunit is one or more rectangles ("pieces"), so
   0.5 x 1 m expansions and L-shaped subunits are just more pieces. */
function isUnit(r) { return r && (r.excavation_type === 'TP' || r.excavation_type === 'Unit'); }
TABLES.subunits = {
  label: 'Subunit', plural: 'Subunits', parent: 'excavations', mode: 'field', legacy: null, custom: 1,
  title: r => `Subunit ${r.letter || '?'}${r.size_label ? ' · ' + r.size_label : ''}`,
  fields: [
    { k: 'letter', l: 'Letter', t: 'text', req: 1 }, { k: 'parts', l: 'Pieces (m, unit grid)', t: 'text' },
    { k: 'size_label', l: 'Size', t: 'ro' }, { k: 'area_m2', l: 'Area (m²)', t: 'ro' },
    { k: 'opened', l: 'Opened', t: 'date' }, { k: 'reason', l: 'Why opened', t: 'text', w: 2 }, { k: 'notes', l: 'Notes', t: 'area', w: 3 },
  ],
};
TABLES.mappoints = {
  label: 'Point', plural: 'Points', parent: 'sites or excavations', mode: 'field', legacy: null,
  title: r => `${r.kind || 'Point'}${r.label ? ' ' + r.label : ''}`,
  fields: [
    { k: 'kind', l: 'What is it?', t: 'select', o: 'mappoint_kind', req: 1 },
    { k: 'label', l: 'Label', t: 'text', ph: 'e.g. B1, IF-3, NE corner of B', help: 'Numbers count up automatically with “Finish & add next”' },
    { k: 'corner', l: 'Which corner (unit grid)', t: 'select', o: '_corners', show: r => r.kind === 'Unit corner' },
    { k: '_gps', l: 'Position', t: 'gps', w: 3 },
    { k: 'notes', l: 'Notes', t: 'text', w: 2 },
  ],
};

/* Boxes and custody events are not tied to one site. Custody is an append-only log: the current holder,
   location and box of a bag are always read from its latest event, so offline devices never conflict. */
TABLES.boxes = {
  label: 'Box', plural: 'Boxes', parent: null, mode: 'custody', legacy: null,
  title: r => `Box ${r.box_no || r.qr || '?'}`,
  fields: [
    { k: 'qr', l: 'Box label (QR)', t: 'qr', req: 1, w: 2 },
    { k: 'box_no', l: 'Box no. / name', t: 'text', req: 1 },
    { k: 'location', l: 'Storage location', t: 'text', req: 1, ph: 'LPAL shelf 3B' },
    { k: 'notes', l: 'Notes', t: 'area', w: 3 },
  ],
};
TABLES.custody = {
  label: 'Custody event', plural: 'Custody log', parent: null, mode: 'custody', legacy: null,
  title: r => `${r.action || ''} · ${r.item_qr || ''}`,
  fields: [
    { k: 'item_qr', l: 'Item', t: 'text', req: 1 }, { k: 'item_kind', l: 'Item kind', t: 'text' },
    { k: 'action', l: 'Action', t: 'select', o: 'custody_action', req: 1 },
    { k: 'to_person', l: 'Now held by', t: 'text', req: 1 }, { k: 'from_person', l: 'Handed over by', t: 'text' },
    { k: 'location', l: 'Location', t: 'text' }, { k: 'box_qr', l: 'Box', t: 'text' },
    { k: 'time', l: 'Time', t: 'text' }, { k: 'notes', l: 'Notes', t: 'text', w: 2 },
  ],
};
/* End-of-day bag check: the field director scans every bag into a box; the record keeps who checked,
   which bags were expected, scanned, missing (and whose they are) and any extra labels. */
TABLES.daychecks = {
  label: 'Bag check', plural: 'End-of-day bag checks', parent: null, mode: 'custody', legacy: null,
  title: r => `Bag check ${r.date || ''}${r.missing_n ? ' · ' + r.missing_n + ' missing' : ''}`,
  fields: [
    { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'checked_by', l: 'Checked by', t: 'text', req: 1 },
    { k: 'sites', l: 'Sites', t: 'text' }, { k: 'boxes', l: 'Boxes', t: 'text' },
    { k: 'expected_n', l: 'Bags expected', t: 'int' }, { k: 'scanned_n', l: 'Bags scanned', t: 'int' },
    { k: 'missing_n', l: 'Bags missing', t: 'int' }, { k: 'extra_n', l: 'Extra labels', t: 'int' },
    { k: 'notes', l: 'Notes', t: 'area', w: 3 },
  ],
};
LISTS.quad = ['Unknown (find later)'];
/* who uses the app: one record per account (or device), written at setup; lets the project see names and roles */
TABLES.people = {
  label: 'Person', plural: 'People', parent: null, mode: 'admin', legacy: null,
  title: r => `${r.name || '?'}${r.role ? ' · ' + r.role : ''}`,
  fields: [{ k: 'name', l: 'Name', t: 'text', req: 1 }, { k: 'role', l: 'Role', t: 'select', o: 'role', req: 1 }, { k: 'email', l: 'Email', t: 'text' }, { k: 'last_setup', l: 'Set up', t: 'text' }],
};
const DISTRICT_CODE = { 'Kisatchie RD': ['KRD', 1], 'Caney RD': ['CRD', 2], 'Vernon Unit': ['VU', 3], 'Evangeline Unit': ['EVU', 4], 'Catahoula RD': ['CAT', 5], 'Winn RD': ['WRD', 6], 'Other': ['OTH', 9] };
const PARISH = { NA: 'Natchitoches', CL: 'Claiborne', WE: 'Webster', GR: 'Grant', WN: 'Winn', RA: 'Rapides', VN: 'Vernon' };
/* Site ID codes are 6 digits: a 2-digit parish number + the 4-digit site number. Parishes are numbered 01–64 from the
   southeast (01 Plaquemines) to the northwest (64 Caddo), by the centre of each parish along a SE→NW line,
   so 16NA41 → 530041 and 16VN2025 → 462025. Codes starting 80 are new sites (80 + district digit + no.)
   and 90 survey areas, which no parish number can reach. */
const PARISH_NO = { Plaquemines: 1, 'St. Bernard': 2, Lafourche: 3, Jefferson: 4, Orleans: 5, Terrebonne: 6, 'St. Charles': 7, 'St. Tammany': 8, 'St. John the Baptist': 9, 'St. James': 10, Assumption: 11, Washington: 12, 'St. Mary': 13, Ascension: 14, Tangipahoa: 15, Livingston: 16, Iberville: 17, Iberia: 18, 'St. Helena': 19, 'East Baton Rouge': 20, 'West Baton Rouge': 21, 'St. Martin': 22, 'East Feliciana': 23, Vermilion: 24, Lafayette: 25, 'Pointe Coupee': 26, 'West Feliciana': 27, 'St. Landry': 28, Acadia: 29, Cameron: 30, 'Jefferson Davis': 31, Evangeline: 32, Avoyelles: 33, Concordia: 34, Allen: 35, Calcasieu: 36, Tensas: 37, Catahoula: 38, Rapides: 39, Madison: 40, Beauregard: 41, 'La Salle': 42, Franklin: 43, Grant: 44, 'East Carroll': 45, Vernon: 46, Caldwell: 47, Richland: 48, 'West Carroll': 49, Winn: 50, Ouachita: 51, Morehouse: 52, Natchitoches: 53, Jackson: 54, Sabine: 55, Union: 56, Lincoln: 57, Bienville: 58, 'Red River': 59, 'De Soto': 60, Claiborne: 61, Webster: 62, Bossier: 63, Caddo: 64 };
/* the first 6-digit numbering (alphabetical, v1.12), kept only so codes made with it are upgraded */
const PARISH_NO_V1 = Object.fromEntries(Object.keys(PARISH_NO).sort((a, b) => a.replace(/\s/g, '').localeCompare(b.replace(/\s/g, ''))).map((p, i) => [p, i + 1]));
/* USGS 7.5' quadrangles around KNF (bounds W, S, E, N in degrees, from the HTMC sheets in the project GIS) */
const QUADS = {"Hurricane Branch": [-93.25, 30.875, -93.125, 31.0], "Sugrue": [-93.125, 30.875, -93.0, 31.0], "Arizona": [-93.0, 32.75, -92.875, 32.875], "Bernice": [-92.75, 32.75, -92.625, 32.875], "Blackburn": [-93.25, 32.75, -93.125, 32.875], "Colquitt": [-93.0, 32.875, -92.875, 33.0], "Haynesville East": [-93.125, 32.875, -93.0, 33.0], "Homer": [-93.125, 32.75, -93.0, 32.875], "Langston": [-93.25, 32.625, -93.125, 32.75], "Leton": [-93.375, 32.75, -93.25, 32.875], "Lillie": [-92.75, 32.875, -92.625, 33.0], "Minden North": [-93.375, 32.625, -93.25, 32.75], "Summerfield": [-92.875, 32.875, -92.75, 33.0], "Savage Creek": [-92.75, 31.625, -92.625, 31.75], "Williana": [-92.625, 31.625, -92.5, 31.75], "Bayou Livrogne": [-93.125, 31.375, -93.0, 31.5], "Bellwood": [-93.25, 31.5, -93.125, 31.625], "Flora": [-93.125, 31.5, -93.0, 31.625], "Gorum": [-93.0, 31.375, -92.875, 31.5], "Kisatchie": [-93.25, 31.375, -93.125, 31.5], "Kurthwood": [-93.25, 31.25, -93.125, 31.375], "Simpson North": [-93.125, 31.25, -93.0, 31.375], "Pitkin": [-93.0, 30.875, -92.875, 31.0]};

LISTS.quad.push(...Object.keys(QUADS).sort());

/* Photo records: metadata syncs like any record; the image goes to Supabase Storage (bucket "photos"). */
TABLES.photos = {
  label: 'Photo', plural: 'Photos', parent: 'any', mode: 'media', legacy: null,
  title: r => `${r.kind || 'Photo'}${r.caption ? ' · ' + r.caption : ''}`,
  fields: [
    { k: 'kind', l: 'View', t: 'text' }, { k: 'caption', l: 'Caption', t: 'text' }, { k: 'path', l: 'Storage path', t: 'text' },
    { k: 'taken_at', l: 'Taken', t: 'text' }, { k: 'width', l: 'Width px', t: 'int' }, { k: 'height', l: 'Height px', t: 'int' }, { k: 'bytes', l: 'Size (bytes)', t: 'int' },
  ],
};
const PHOTO_KINDS = {
  excavations: ['Overview', 'Plan view', 'Profile', 'Other'],
  levels: ['Level floor', 'Profile', 'Special find', 'In situ find', 'Other'],
  boxes: ['Label', 'Contents', 'Other'],
  features: ['Plan view', 'Profile/bisect', 'Other'],
  samples: ['In situ', 'Other'],
  lithic_tools: ['Obverse', 'Reverse', 'Edge/profile', 'Other'],
  prehistoric_ceramics: ['Exterior', 'Interior', 'Profile', 'Other'],
  ground_stone: ['Obverse', 'Reverse', 'Other'],
  historic_artifacts: ['Front', 'Back', 'Maker\'s mark', 'Other'],
};

const TYPE_CODE = { 'STP': '01', 'TP': '02', 'Unit': '03', 'Surface collection': '04', 'Feature grouping': '05' };

/* The KNF site list (trinomials, districts, recorded locations, Phase II candidates) is NOT in this public code:
   it is kept in the private Supabase table site_registry and downloaded after sign-in. */
const SEED_SITES = [];

if (typeof module !== 'undefined') module.exports = { LISTS, TABLES, TYPE_CODE, SEED_SITES, PHOTO_KINDS, DISTRICT_CODE, isUnit, PARISH, QUADS, PARISH_NO, PARISH_NO_V1 };
