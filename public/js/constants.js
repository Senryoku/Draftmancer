(function(exports) { 
	const Languages = [
		{code: 'en',  name: 'English'},
		{code: 'es',  name: 'Spanish'},
		{code: 'fr',  name: 'French'},
		{code: 'de',  name: 'German'},
		{code: 'it',  name: 'Italian'},
		{code: 'pt',  name: 'Portuguese'},
		{code: 'ja',  name: 'Japanese'},
		{code: 'ko',  name: 'Korean'},
		{code: 'ru',  name: 'Russian'},
		{code: 'zhs', name: 'Simplified Chinese'},
		{code: 'zht', name: 'Traditional Chinese'}
	];
	const MTGSets = ["m19", "xln", "rix", "dom", "grn", "rna", "war", "m20", "eld", "thb"];
	
	Object.freeze(Languages);
	Object.freeze(MTGSets);

    exports.Languages = Languages;    
    exports.MTGSets = MTGSets;    
})(typeof exports === 'undefined' ? this['constants'] = {}: exports); 