define([
    'ko',
    'jquery',
    'Smile_ElasticsuiteCore/js/form-mini'
], function (ko, $) {
    'use strict';

    $.widget('fastEs.quickSearch', $.smileEs.quickSearch, {
        /**
         * Overriden constructor to ensure templates initialization on load
         *
         * @private
         */
        _create: function () {
            console.log("fastEs.quickSearch")
            this.currentRequests = [];
            this._super();

            this.autoCompletes = [];
            //@TODO build these url from magento
            this.mappers = [
                {
                    css_class:"quickSearch_product",
                    url : '/elastic/magento2_default_catalog_product/product/_search',
                    query : function (value) {
                        //@TODO build this query from magento
                        return {"size":5,"sort":[{"_score":{"order":"desc"}},{"entity_id":{"order":"desc","missing":"_first","unmapped_type":"keyword"}}],"from":0,"query":{"bool":{"filter":{"bool":{"must":[{"term":{"stock.is_in_stock":{"value":true,"boost":1}}},{"terms":{"visibility":[3,4],"boost":1}}],"must_not":[],"should":[],"boost":1}},"must":{"bool":{"must":[],"must_not":[],"should":[{"bool":{"filter":{"multi_match":{"query":value,"fields":["search^1","sku^1"],"minimum_should_match":"100%","tie_breaker":1,"boost":1,"type":"best_fields","cutoff_frequency":0.15}},"must":{"multi_match":{"query":value,"fields":["search^1","name^5","sku^6","search.whitespace^10","name.whitespace^50","sku.whitespace^60","name.sortable^100","sku.sortable^120"],"minimum_should_match":1,"tie_breaker":1,"boost":1,"type":"best_fields","cutoff_frequency":0.15}},"boost":1}}],"minimum_should_match":1,"boost":1}},"boost":1}}};
                    },
                    convert : function (result){
                        //@TODO render this with magento API
                        return {
                            type:"product",
                            title:result._source.name.join(" "),
                            image:'/pub/media/catalog/product/' + result._source.image[0],
                            url:'/catalog/product/view/id/' + result._source.entity_id,
                            price:result._source.price[0].price
                        }
                    }
                },
                {
                    css_class:"quickSearch_category",
                    url : '/elastic/magento2_default_catalog_category/category/_search',
                    query : function (value) {
                        //@TODO build this query from magento
                        return {"size":3,"sort":[{"_score":{"order":"desc"}},{"entity_id":{"order":"desc","missing":"_first","unmapped_type":"keyword"}}],"from":0,"query":{"bool":{"must":{"bool":{"must":[],"must_not":[],"should":[{"bool":{"filter":{"multi_match":{"query":value,"fields":["search^1","sku^1"],"minimum_should_match":"100%","tie_breaker":1,"boost":1,"type":"best_fields","cutoff_frequency":0.15}},"must":{"multi_match":{"query":value,"fields":["search^1","search.whitespace^10"],"minimum_should_match":1,"tie_breaker":1,"boost":1,"type":"best_fields","cutoff_frequency":0.15}},"boost":1}}],"minimum_should_match":1,"boost":1}},"boost":1}}};
                    },
                    convert : function (result) {
                        return {
                            type:"category",
                            url:'/' + result._source.url_path[0] + '.html',
                            title:result._source.name.join(" "),
                            "breadcrumb": []
                        }
                    }
                }
            ];
            this.mappers.forEach(function (mapper){
                this.autoComplete.append('<div id="'+mapper.css_class+'"></div>');
                this.autoCompletes[mapper.url] = $('#' + mapper.css_class);
            }.bind(this));
        },

        /**
         * Executes when the value of the search input field changes. Executes a GET request
         * to populate a suggestion list based on entered text. Handles click (select), hover,
         * and mouseout events on the populated suggestion list dropdown.
         *
         * Overriden to :
         *  - move rendering of elements in a subfunction.
         *  - manage redirection when clicking a result having an href attribute.
         *
         * @private
         */
        _onPropertyChange: _.debounce(function () {
            var searchField = this.element,
                clonePosition = {
                    position: 'absolute',
                    // Removed to fix display issues
                    // left: searchField.offset().left,
                    // top: searchField.offset().top + searchField.outerHeight(),
                    width: searchField.outerWidth()
                },
                value = this.element.val();

            this.submitBtn.disabled = this._isEmpty(value);

            if (value.length >= parseInt(this.options.minSearchLength, 10)) {
                this.searchForm.addClass('processing');

                this.mappers.forEach(function processUrl(mapper) {
                //@TODO refactor this in smile/module-elasticsuite-core js/form-mini to reduce override line number

                this.currentRequests[mapper.url] = $.ajax({
                    method: "POST",
                    url: mapper.url,
                    dataType: "json",
                    contentType: "application/json",
                    data: JSON.stringify(mapper.query(value)),
                    // This function will ensure proper killing of the last Ajax call.
                    // In order to prevent requests of an old request to pop up later and replace results.
                    beforeSend: function () {
                        if (typeof(this.currentRequests[mapper.url]) != "undefined" && this.currentRequests[mapper.url] !== null) {
                            this.currentRequests[mapper.url].abort();
                        }
                    }.bind(this),
                    success: $.proxy(function (dataEs) {
                        var data = dataEs.hits.hits.map(mapper.convert);
                        var self = this;
                        var lastElement = false;
                        var content = this._getResultWrapper();
                        var sectionDropdown = this._getSectionHeader();
                        $.each(data, function (index, element) {

                            if (!lastElement || (lastElement && lastElement.type !== element.type)) {
                                sectionDropdown = this._getSectionHeader(element.type, data);
                            }

                            var elementHtml = this._renderItem(element, index);

                            sectionDropdown.append(elementHtml);

                            if (!lastElement || (lastElement && lastElement.type !== element.type)) {
                                content.append(sectionDropdown);
                            }

                            lastElement = element;
                        }.bind(this));
                        this.autoCompletes[mapper.url].html(content);
                        this.responseList.indexList = this.autoComplete
                            .css(clonePosition)
                            .show()
                            .find(this.options.responseFieldElements + ':visible');

                        this._resetResponseList(false);
                        this.element.removeAttr('aria-activedescendant');

                        if (this.responseList.indexList.length) {
                            this._updateAriaHasPopup(true);
                        } else {
                            this._updateAriaHasPopup(false);
                        }

                        this.responseList.indexList
                            .on('click', function (e) {
                                self.responseList.selected = $(this);
                                if (self.responseList.selected.attr("href")) {
                                    window.location.href = self.responseList.selected.attr("href");
                                    e.stopPropagation();
                                    return false;
                                }
                                self.searchForm.trigger('submit');
                            })
                            .on('mouseenter mouseleave', function (e) {
                                self.responseList.indexList.removeClass(self.options.selectClass);
                                $(this).addClass(self.options.selectClass);
                                self.responseList.selected = $(e.target);
                                self.element.attr('aria-activedescendant', $(e.target).attr('id'));
                            })
                            .on('mouseout', function () {
                                if (!self._getLastElement() && self._getLastElement().hasClass(self.options.selectClass)) {
                                    $(this).removeClass(self.options.selectClass);
                                    self._resetResponseList(false);
                                }
                            });
                    }, this),
                    complete: $.proxy(function () {
                        this.searchForm.removeClass('processing');
                    }, this)
                });
                }.bind(this));
            } else {
                this._resetResponseList(true);
                this.autoCompletes.forEach(function (e) {
                    e.hide();
                });
                this._updateAriaHasPopup(false);
                this.element.removeAttr('aria-activedescendant');
            }
        }, 250),

    });

    return $.fastEs.quickSearch;
});
